import { Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  companyMembers,
  companyOrganizationUnitMembers,
  organizationTrees,
  organizationUnits,
  projectMembers,
  projectOrganizationUnitMembers,
  users,
} from '@/database/schema'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import { AccessService, type AccessActor } from '@/modules/access/access.service'
import {
  checkVersion,
  requireFound,
  type AccessDb,
  type AccessTx,
} from '@/modules/access/access.store'
import type {
  CreateOrganizationUnitRequest,
  MoveOrganizationUnitRequest,
  OrganizationDuty,
  OrganizationMembershipRecord,
  OrganizationScope,
  OrganizationTreeQuery,
  OrganizationTreeRecord,
  OrganizationUnitMemberRecord,
  OrganizationUnitRecord,
  ReplaceMemberOrganizationUnitsRequest,
  ReplaceMemberOrganizationUnitsResult,
  ReplaceOrganizationUnitMembersRequest,
  ReplaceOrganizationUnitMembersResult,
  StatusRequest,
  UpdateOrganizationUnitRequest,
} from 'shared/types'
import {
  ORGANIZATION_MAX_DEPTH,
  normalizeOrganizationCode,
  normalizeOrganizationKey,
} from 'shared/utils'
import {
  deriveOrganizationUnits,
  isOrganizationDutyUpgrade,
  nextOrganizationSort,
  organizationDutyOrder,
  organizationScopeColumns,
  organizationTreeFilter,
  relationDiff,
  toOrganizationUnitRecord,
  type OrganizationUnitRow,
} from '../organization.store'

interface ScopeMember {
  id: string
  userId: string
  account: string
  name: string
  status: 'active' | 'disabled'
  accountStatus: 'active' | 'locked' | 'disabled'
}

interface MembershipRow {
  id: string
  organizationUnitId: string
  userId: string
  duty: OrganizationDuty
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class OrganizationUnitsService {
  constructor(private readonly access: AccessService) {}

  /** 按完整租户作用域读取唯一组织树，跨企业或跨项目标识统一按不存在处理。 */
  private async tree(db: AccessDb, scope: OrganizationScope) {
    const [row] = await db.select().from(organizationTrees).where(organizationTreeFilter(scope))
    return requireFound(row)
  }

  /** 在指定树内读取全部节点，用于同一快照派生路径、深度与有效状态。 */
  private allUnits(db: AccessDb, treeId: string) {
    return db
      .select()
      .from(organizationUnits)
      .where(eq(organizationUnits.treeId, treeId))
      .orderBy(asc(organizationUnits.sort), asc(organizationUnits.id))
  }

  /** 读取作用域内的组织单元及整棵树派生信息，避免按裸 unitId 跨租户查询。 */
  private async unitContext(db: AccessDb, scope: OrganizationScope, unitId: string) {
    const tree = await this.tree(db, scope)
    const rows = await this.allUnits(db, tree.id)
    const row = requireFound(rows.find((item) => item.id === unitId))
    return { tree, rows, row, derived: deriveOrganizationUnits(rows) }
  }

  /** 将指定组织单元转换为包含派生路径的公开记录。 */
  private async unitRecord(
    db: AccessDb,
    scope: OrganizationScope,
    unitId: string,
  ): Promise<OrganizationUnitRecord> {
    const context = await this.unitContext(db, scope, unitId)
    return toOrganizationUnitRecord(context.row, context.derived.get(unitId)!)
  }

  /**
   * 返回指定节点的全部后代 ID；调用方可用它阻止移动到自身子树并计算子树高度。
   */
  private descendantIds(rows: OrganizationUnitRow[], rootId: string): Set<string> {
    const children = new Map<string, string[]>()
    for (const row of rows) {
      if (!row.parentId) continue
      const list = children.get(row.parentId) ?? []
      list.push(row.id)
      children.set(row.parentId, list)
    }
    const result = new Set<string>()
    const pending = [...(children.get(rootId) ?? [])]
    while (pending.length) {
      const id = pending.pop()!
      if (result.has(id)) continue
      result.add(id)
      pending.push(...(children.get(id) ?? []))
    }
    return result
  }

  /** 按当前作用域读取成员和账号状态，返回 userId 到成员快照的映射。 */
  private async scopeMembers(
    db: AccessDb,
    scope: OrganizationScope,
    userIds?: string[],
  ): Promise<Map<string, ScopeMember>> {
    if (userIds && userIds.length === 0) return new Map()
    const rows =
      scope.type === 'company'
        ? await db
            .select({
              id: companyMembers.id,
              userId: companyMembers.userId,
              account: users.account,
              name: users.name,
              status: companyMembers.status,
              accountStatus: users.status,
            })
            .from(companyMembers)
            .innerJoin(users, eq(users.id, companyMembers.userId))
            .where(
              and(
                eq(companyMembers.companyId, scope.companyId),
                userIds ? inArray(companyMembers.userId, userIds) : undefined,
              ),
            )
        : await db
            .select({
              id: projectMembers.id,
              userId: projectMembers.userId,
              account: users.account,
              name: users.name,
              status: projectMembers.status,
              accountStatus: users.status,
            })
            .from(projectMembers)
            .innerJoin(users, eq(users.id, projectMembers.userId))
            .where(
              and(
                eq(projectMembers.companyId, scope.companyId),
                eq(projectMembers.projectId, scope.projectId),
                userIds ? inArray(projectMembers.userId, userIds) : undefined,
              ),
            )
    return new Map(rows.map((row) => [row.userId, row]))
  }

  /** 查询当前作用域内指定成员或组织单元的关系，并统一企业和项目表的返回形状。 */
  private async memberships(
    db: AccessDb,
    input: { scope: OrganizationScope; userId?: string; organizationUnitId?: string },
  ): Promise<MembershipRow[]> {
    const { scope } = input
    if (scope.type === 'company') {
      return db
        .select({
          id: companyOrganizationUnitMembers.id,
          organizationUnitId: companyOrganizationUnitMembers.organizationUnitId,
          userId: companyOrganizationUnitMembers.userId,
          duty: companyOrganizationUnitMembers.duty,
          createdAt: companyOrganizationUnitMembers.createdAt,
          updatedAt: companyOrganizationUnitMembers.updatedAt,
        })
        .from(companyOrganizationUnitMembers)
        .where(
          and(
            eq(companyOrganizationUnitMembers.companyId, scope.companyId),
            input.userId ? eq(companyOrganizationUnitMembers.userId, input.userId) : undefined,
            input.organizationUnitId
              ? eq(companyOrganizationUnitMembers.organizationUnitId, input.organizationUnitId)
              : undefined,
          ),
        )
    }
    return db
      .select({
        id: projectOrganizationUnitMembers.id,
        organizationUnitId: projectOrganizationUnitMembers.organizationUnitId,
        userId: projectOrganizationUnitMembers.userId,
        duty: projectOrganizationUnitMembers.duty,
        createdAt: projectOrganizationUnitMembers.createdAt,
        updatedAt: projectOrganizationUnitMembers.updatedAt,
      })
      .from(projectOrganizationUnitMembers)
      .where(
        and(
          eq(projectOrganizationUnitMembers.companyId, scope.companyId),
          eq(projectOrganizationUnitMembers.projectId, scope.projectId),
          input.userId ? eq(projectOrganizationUnitMembers.userId, input.userId) : undefined,
          input.organizationUnitId
            ? eq(projectOrganizationUnitMembers.organizationUnitId, input.organizationUnitId)
            : undefined,
        ),
      )
  }

  /**
   * 仅在新增关系或职责升级时要求账号、成员与组织单元均有效；保留、移除及降级不受阻。
   */
  private assertRelationChange(input: {
    member: ScopeMember
    unitEffective: boolean
    previousDuty?: OrganizationDuty
    nextDuty: OrganizationDuty
  }) {
    if (!isOrganizationDutyUpgrade(input.previousDuty, input.nextDuty)) return
    if (
      input.member.accountStatus !== 'active' ||
      input.member.status !== 'active' ||
      !input.unitEffective
    )
      throw new AppException(ACCESS_ERRORS.INVALID_MEMBER_RELATION)
  }

  /** 将一名成员的组织关系增删改写入正确的企业或项目关系表，并保留未变化关系 ID。 */
  private async persistMemberRelations(
    tx: AccessTx,
    input: {
      scope: OrganizationScope
      treeId: string
      userId: string
      previous: Map<string, MembershipRow>
      next: Map<string, OrganizationDuty>
    },
  ) {
    const removedIds = [...input.previous.values()]
      .filter((row) => !input.next.has(row.organizationUnitId))
      .map((row) => row.id)
    const added = [...input.next]
      .filter(([unitId]) => !input.previous.has(unitId))
      .map(([organizationUnitId, duty]) => ({ organizationUnitId, duty }))
    const changed = [...input.next]
      .map(([unitId, duty]) => ({ row: input.previous.get(unitId), duty }))
      .filter(
        (item): item is { row: MembershipRow; duty: OrganizationDuty } =>
          !!item.row && item.row.duty !== item.duty,
      )
    const scopeColumns = organizationScopeColumns(input.scope)
    if (input.scope.type === 'company') {
      if (removedIds.length)
        await tx
          .delete(companyOrganizationUnitMembers)
          .where(inArray(companyOrganizationUnitMembers.id, removedIds))
      for (const item of changed) {
        await tx
          .update(companyOrganizationUnitMembers)
          .set({ duty: item.duty, updatedAt: new Date() })
          .where(eq(companyOrganizationUnitMembers.id, item.row.id))
      }
      if (added.length)
        await tx.insert(companyOrganizationUnitMembers).values(
          added.map((item) => ({
            scopeType: 'company' as const,
            companyId: input.scope.companyId,
            treeId: input.treeId,
            organizationUnitId: item.organizationUnitId,
            userId: input.userId,
            duty: item.duty,
          })),
        )
      return
    }
    if (removedIds.length)
      await tx
        .delete(projectOrganizationUnitMembers)
        .where(inArray(projectOrganizationUnitMembers.id, removedIds))
    for (const item of changed) {
      await tx
        .update(projectOrganizationUnitMembers)
        .set({ duty: item.duty, updatedAt: new Date() })
        .where(eq(projectOrganizationUnitMembers.id, item.row.id))
    }
    const projectId = input.scope.projectId
    if (added.length)
      await tx.insert(projectOrganizationUnitMembers).values(
        added.map((item) => ({
          ...scopeColumns,
          scopeType: 'project' as const,
          projectId,
          treeId: input.treeId,
          organizationUnitId: item.organizationUnitId,
          userId: input.userId,
          duty: item.duty,
        })),
      )
  }

  /** 返回某成员当前作用域内的组织关系，并按职责和关系 ID 稳定排序。 */
  private async memberRelationResult(
    db: AccessDb,
    input: { scope: OrganizationScope; userId: string },
  ): Promise<ReplaceMemberOrganizationUnitsResult> {
    const tree = await this.tree(db, input.scope)
    const [rows, relations] = await Promise.all([
      this.allUnits(db, tree.id),
      this.memberships(db, { scope: input.scope, userId: input.userId }),
    ])
    const unitsById = new Map(rows.map((row) => [row.id, row]))
    const derived = deriveOrganizationUnits(rows)
    const records: OrganizationMembershipRecord[] = relations
      .map((relation) => {
        const unit = requireFound(unitsById.get(relation.organizationUnitId))
        const unitRecord = toOrganizationUnitRecord(unit, derived.get(unit.id)!)
        return {
          id: relation.id,
          organizationUnit: {
            id: unitRecord.id,
            name: unitRecord.name,
            code: unitRecord.code,
            fullPath: unitRecord.fullPath,
            status: unitRecord.status,
          },
          duty: relation.duty,
          createdAt: relation.createdAt.toISOString(),
          updatedAt: relation.updatedAt.toISOString(),
        }
      })
      .sort(
        (left, right) =>
          organizationDutyOrder(left.duty) - organizationDutyOrder(right.duty) ||
          left.id.localeCompare(right.id),
      )
    return { userId: input.userId, relations: records }
  }

  /** 返回某组织单元的完整成员关系，并按职责和关系 ID 稳定排序。 */
  private async unitMemberResult(
    db: AccessDb,
    input: { scope: OrganizationScope; organizationUnitId: string },
  ): Promise<ReplaceOrganizationUnitMembersResult> {
    const [relations, members] = await Promise.all([
      this.memberships(db, input),
      this.scopeMembers(db, input.scope),
    ])
    const records: OrganizationUnitMemberRecord[] = relations
      .map((relation) => {
        const member = requireFound(members.get(relation.userId))
        return {
          membershipId: relation.id,
          member: {
            id: member.id,
            userId: member.userId,
            account: member.account,
            name: member.name,
            status: member.status,
            accountStatus: member.accountStatus,
          },
          duty: relation.duty,
          createdAt: relation.createdAt.toISOString(),
          updatedAt: relation.updatedAt.toISOString(),
        }
      })
      .sort(
        (left, right) =>
          organizationDutyOrder(left.duty) - organizationDutyOrder(right.duty) ||
          left.membershipId.localeCompare(right.membershipId),
      )
    return { organizationUnitId: input.organizationUnitId, members: records }
  }

  /** 按父节点懒加载一层组织单元，同时返回每个节点当前完整路径和有效状态。 */
  treeView(input: {
    actor: AccessActor
    scope: OrganizationScope
    query: OrganizationTreeQuery
  }): Promise<OrganizationTreeRecord> {
    return this.access.read(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.organization.read`,
      },
      async (tx) => {
        const tree = await this.tree(tx, input.scope)
        const rows = await this.allUnits(tx, tree.id)
        if (input.query.parentId && !rows.some((row) => row.id === input.query.parentId))
          throw new AppException(ACCESS_ERRORS.NOT_FOUND)
        const derived = deriveOrganizationUnits(rows)
        const parentId = input.query.parentId ?? null
        return {
          id: tree.id,
          scope: input.scope,
          parentId,
          units: rows
            .filter((row) => row.parentId === parentId)
            .map((row) => ({
              ...toOrganizationUnitRecord(row, derived.get(row.id)!),
              effective: derived.get(row.id)!.effective,
              hasChildren: derived.get(row.id)!.hasChildren,
            })),
        }
      },
    )
  }

  /** 创建组织单元，锁内校验父级有效性、深度、同父名称、树内编码和默认排序。 */
  create(input: {
    actor: AccessActor
    scope: OrganizationScope
    body: CreateOrganizationUnitRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.organization.create`,
      },
      async (tx, access) => {
        const tree = await this.tree(tx, input.scope)
        const rows = await this.allUnits(tx, tree.id)
        const derived = deriveOrganizationUnits(rows)
        const parentId = input.body.parentId ?? null
        if (parentId) {
          const parent = requireFound(rows.find((row) => row.id === parentId))
          const parentDerived = derived.get(parent.id)!
          if (!parentDerived.effective)
            throw new AppException(ACCESS_ERRORS.INVALID_MEMBER_RELATION)
          if (parentDerived.depth >= ORGANIZATION_MAX_DEPTH)
            throw new AppException(ACCESS_ERRORS.ORGANIZATION_DEPTH_EXCEEDED)
        }
        const nameKey = normalizeOrganizationKey(input.body.name)
        const codeKey = normalizeOrganizationCode(input.body.code)
        if (
          rows.some(
            (row) => row.parentId === parentId && normalizeOrganizationKey(row.name) === nameKey,
          ) ||
          rows.some((row) => normalizeOrganizationCode(row.code) === codeKey)
        )
          throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
        const siblings = rows.filter((row) => row.parentId === parentId)
        const [created] = await tx
          .insert(organizationUnits)
          .values({
            treeId: tree.id,
            parentId,
            name: input.body.name,
            nameKey,
            code: input.body.code,
            codeKey,
            description: input.body.description ?? '',
            sort: input.body.sort ?? nextOrganizationSort(siblings),
          })
          .returning({ id: organizationUnits.id })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'organization.unit.create',
          objectType: 'organization_unit',
          objectId: created!.id,
          summary: { parentId, treeId: tree.id },
        })
        return this.unitRecord(tx, input.scope, created!.id)
      },
    )
  }

  /** 更新组织单元资料或排序，使用 expectedVersion 防止覆盖并保持唯一规范键。 */
  update(input: {
    actor: AccessActor
    scope: OrganizationScope
    unitId: string
    body: UpdateOrganizationUnitRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.organization.update`,
      },
      async (tx, access) => {
        const context = await this.unitContext(tx, input.scope, input.unitId)
        checkVersion(context.row.version, input.body.expectedVersion)
        const nameKey = input.body.name ? normalizeOrganizationKey(input.body.name) : undefined
        const codeKey = input.body.code ? normalizeOrganizationCode(input.body.code) : undefined
        if (
          nameKey &&
          context.rows.some(
            (row) =>
              row.id !== input.unitId &&
              row.parentId === context.row.parentId &&
              normalizeOrganizationKey(row.name) === nameKey,
          )
        )
          throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
        if (
          codeKey &&
          context.rows.some(
            (row) => row.id !== input.unitId && normalizeOrganizationCode(row.code) === codeKey,
          )
        )
          throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
        const { expectedVersion: _, ...changes } = input.body
        await tx
          .update(organizationUnits)
          .set({
            ...changes,
            ...(nameKey ? { nameKey } : {}),
            ...(codeKey ? { codeKey } : {}),
            version: sql`${organizationUnits.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(organizationUnits.treeId, context.tree.id),
              eq(organizationUnits.id, input.unitId),
            ),
          )
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'organization.unit.update',
          objectType: 'organization_unit',
          objectId: input.unitId,
          summary: { changedFields: Object.keys(changes) },
        })
        return this.unitRecord(tx, input.scope, input.unitId)
      },
    )
  }

  /** 移动同树节点并验证循环、目标父级有效性、同父名称和移动后完整子树深度。 */
  move(input: {
    actor: AccessActor
    scope: OrganizationScope
    unitId: string
    body: MoveOrganizationUnitRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.organization.move`,
      },
      async (tx, access) => {
        const context = await this.unitContext(tx, input.scope, input.unitId)
        checkVersion(context.row.version, input.body.expectedVersion)
        const descendantIds = this.descendantIds(context.rows, input.unitId)
        if (
          input.body.parentId === input.unitId ||
          (input.body.parentId && descendantIds.has(input.body.parentId))
        )
          throw new AppException(ACCESS_ERRORS.ORGANIZATION_CYCLE)
        const targetParent = input.body.parentId
          ? requireFound(context.rows.find((row) => row.id === input.body.parentId))
          : undefined
        const targetDepth = targetParent ? context.derived.get(targetParent.id)!.depth + 1 : 1
        if (targetParent && !context.derived.get(targetParent.id)!.effective)
          throw new AppException(ACCESS_ERRORS.INVALID_MEMBER_RELATION)
        const currentDepth = context.derived.get(input.unitId)!.depth
        const maximumSubtreeDepth = [input.unitId, ...descendantIds].reduce(
          (maximum, id) => Math.max(maximum, context.derived.get(id)!.depth - currentDepth),
          0,
        )
        if (targetDepth + maximumSubtreeDepth > ORGANIZATION_MAX_DEPTH)
          throw new AppException(ACCESS_ERRORS.ORGANIZATION_DEPTH_EXCEEDED)
        if (
          context.rows.some(
            (row) =>
              row.id !== input.unitId &&
              row.parentId === input.body.parentId &&
              normalizeOrganizationKey(row.name) === normalizeOrganizationKey(context.row.name),
          )
        )
          throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
        const siblings = context.rows.filter(
          (row) => row.id !== input.unitId && row.parentId === input.body.parentId,
        )
        const nextSort = input.body.sort ?? nextOrganizationSort(siblings)
        await tx
          .update(organizationUnits)
          .set({
            parentId: input.body.parentId,
            sort: nextSort,
            version: sql`${organizationUnits.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(organizationUnits.treeId, context.tree.id),
              eq(organizationUnits.id, input.unitId),
            ),
          )
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'organization.unit.move',
          objectType: 'organization_unit',
          objectId: input.unitId,
          summary: {
            fromParentId: context.row.parentId,
            toParentId: input.body.parentId,
            fromSort: context.row.sort,
            toSort: nextSort,
          },
        })
        return this.unitRecord(tx, input.scope, input.unitId)
      },
    )
  }

  /** 启停组织单元并保留后代状态和现有成员关系。 */
  status(input: {
    actor: AccessActor
    scope: OrganizationScope
    unitId: string
    body: StatusRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.organization.update`,
      },
      async (tx, access) => {
        const context = await this.unitContext(tx, input.scope, input.unitId)
        checkVersion(context.row.version, input.body.expectedVersion)
        await tx
          .update(organizationUnits)
          .set({
            status: input.body.status,
            version: sql`${organizationUnits.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(organizationUnits.treeId, context.tree.id),
              eq(organizationUnits.id, input.unitId),
            ),
          )
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'organization.unit.status',
          objectType: 'organization_unit',
          objectId: input.unitId,
          summary: { fromStatus: context.row.status, toStatus: input.body.status },
        })
        return this.unitRecord(tx, input.scope, input.unitId)
      },
    )
  }

  /** 按成员全量替换当前作用域内组织关系，允许空集合并原子校验负责人唯一性。 */
  replaceMemberUnits(input: {
    actor: AccessActor
    scope: OrganizationScope
    userId: string
    body: ReplaceMemberOrganizationUnitsRequest
  }): Promise<ReplaceMemberOrganizationUnitsResult> {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.organization.assign`,
      },
      async (tx, access) => {
        const tree = await this.tree(tx, input.scope)
        const [rows, memberMap, previousRows] = await Promise.all([
          this.allUnits(tx, tree.id),
          this.scopeMembers(tx, input.scope, [input.userId]),
          this.memberships(tx, { scope: input.scope, userId: input.userId }),
        ])
        const member = requireFound(memberMap.get(input.userId))
        const unitsById = new Map(rows.map((row) => [row.id, row]))
        const derived = deriveOrganizationUnits(rows)
        const previous = new Map(previousRows.map((row) => [row.organizationUnitId, row]))
        const next = new Map(
          input.body.relations.map((relation) => [relation.organizationUnitId, relation.duty]),
        )
        for (const [unitId, duty] of next) {
          const unit = requireFound(unitsById.get(unitId))
          this.assertRelationChange({
            member,
            unitEffective: derived.get(unit.id)!.effective,
            previousDuty: previous.get(unitId)?.duty,
            nextDuty: duty,
          })
        }
        const leaderUnitIds = [...next]
          .filter(([, duty]) => duty === 'leader')
          .map(([unitId]) => unitId)
        if (leaderUnitIds.length) {
          const conflicting =
            input.scope.type === 'company'
              ? await tx
                  .select({ id: companyOrganizationUnitMembers.id })
                  .from(companyOrganizationUnitMembers)
                  .where(
                    and(
                      eq(companyOrganizationUnitMembers.companyId, input.scope.companyId),
                      inArray(companyOrganizationUnitMembers.organizationUnitId, leaderUnitIds),
                      eq(companyOrganizationUnitMembers.duty, 'leader'),
                      ne(companyOrganizationUnitMembers.userId, input.userId),
                    ),
                  )
                  .limit(1)
              : await tx
                  .select({ id: projectOrganizationUnitMembers.id })
                  .from(projectOrganizationUnitMembers)
                  .where(
                    and(
                      eq(projectOrganizationUnitMembers.companyId, input.scope.companyId),
                      eq(projectOrganizationUnitMembers.projectId, input.scope.projectId),
                      inArray(projectOrganizationUnitMembers.organizationUnitId, leaderUnitIds),
                      eq(projectOrganizationUnitMembers.duty, 'leader'),
                      ne(projectOrganizationUnitMembers.userId, input.userId),
                    ),
                  )
                  .limit(1)
          if (conflicting.length) throw new AppException(ACCESS_ERRORS.ORGANIZATION_LEADER_CONFLICT)
        }
        await this.persistMemberRelations(tx, {
          scope: input.scope,
          treeId: tree.id,
          userId: input.userId,
          previous,
          next,
        })
        const diff = relationDiff({
          previous: new Map([...previous].map(([id, row]) => [id, row.duty])),
          next,
          changed: (before, after) => before !== after,
        })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'organization.members.replace',
          objectType: 'organization_member',
          objectId: input.userId,
          summary: {
            direction: 'member',
            targetUserId: input.userId,
            beforeCount: previous.size,
            afterCount: next.size,
            ...diff,
          },
        })
        return this.memberRelationResult(tx, { scope: input.scope, userId: input.userId })
      },
    )
  }

  /**
   * 按组织单元全量替换成员关系，只影响该单元并保留成员在其他单元的关系。
   *
   * 写入时先删除旧关系并完成所有非负责人职责，再最后写入唯一负责人，避免负责人交接
   * 因数据库逐行更新顺序短暂形成双负责人而误触部分唯一索引。
   */
  replaceUnitMembers(input: {
    actor: AccessActor
    scope: OrganizationScope
    unitId: string
    body: ReplaceOrganizationUnitMembersRequest
  }): Promise<ReplaceOrganizationUnitMembersResult> {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.organization.assign`,
      },
      async (tx, access) => {
        const context = await this.unitContext(tx, input.scope, input.unitId)
        const previousRows = await this.memberships(tx, {
          scope: input.scope,
          organizationUnitId: input.unitId,
        })
        const next = new Map(input.body.members.map((member) => [member.userId, member.duty]))
        if ([...next.values()].filter((duty) => duty === 'leader').length > 1)
          throw new AppException(ACCESS_ERRORS.ORGANIZATION_LEADER_CONFLICT)
        const memberMap = await this.scopeMembers(tx, input.scope, [...next.keys()])
        if (memberMap.size !== next.size) throw new AppException(ACCESS_ERRORS.NOT_FOUND)
        const previous = new Map(previousRows.map((row) => [row.userId, row]))
        for (const [userId, duty] of next) {
          this.assertRelationChange({
            member: memberMap.get(userId)!,
            unitEffective: context.derived.get(input.unitId)!.effective,
            previousDuty: previous.get(userId)?.duty,
            nextDuty: duty,
          })
        }
        for (const [userId, row] of previous) {
          const desiredDuty = next.get(userId)
          if (desiredDuty === undefined || desiredDuty === row.duty) continue
          const member =
            memberMap.get(userId) ??
            (await this.scopeMembers(tx, input.scope, [userId])).get(userId)
          if (!member) throw new AppException(ACCESS_ERRORS.NOT_FOUND)
          this.assertRelationChange({
            member,
            unitEffective: context.derived.get(input.unitId)!.effective,
            previousDuty: row.duty,
            nextDuty: desiredDuty,
          })
        }
        const nextByUnitForEachMember = new Map<string, OrganizationDuty>()
        for (const [userId, duty] of next) nextByUnitForEachMember.set(userId, duty)
        const removedIds = previousRows.filter((row) => !next.has(row.userId)).map((row) => row.id)
        const changed = previousRows.filter(
          (row) => next.has(row.userId) && next.get(row.userId) !== row.duty,
        )
        const added = [...next]
          .filter(([userId]) => !previous.has(userId))
          .map(([userId, duty]) => ({ userId, duty }))
        const nonLeaderChanges = changed.filter((row) => next.get(row.userId) !== 'leader')
        const leaderChanges = changed.filter((row) => next.get(row.userId) === 'leader')
        const nonLeaderAdded = added.filter((item) => item.duty !== 'leader')
        const leaderAdded = added.filter((item) => item.duty === 'leader')
        if (input.scope.type === 'company') {
          if (removedIds.length)
            await tx
              .delete(companyOrganizationUnitMembers)
              .where(inArray(companyOrganizationUnitMembers.id, removedIds))
          for (const row of nonLeaderChanges) {
            await tx
              .update(companyOrganizationUnitMembers)
              .set({ duty: next.get(row.userId)!, updatedAt: new Date() })
              .where(eq(companyOrganizationUnitMembers.id, row.id))
          }
          if (nonLeaderAdded.length)
            await tx.insert(companyOrganizationUnitMembers).values(
              nonLeaderAdded.map((item) => ({
                scopeType: 'company' as const,
                companyId: input.scope.companyId,
                treeId: context.tree.id,
                organizationUnitId: input.unitId,
                userId: item.userId,
                duty: item.duty,
              })),
            )
          for (const row of leaderChanges) {
            await tx
              .update(companyOrganizationUnitMembers)
              .set({ duty: 'leader', updatedAt: new Date() })
              .where(eq(companyOrganizationUnitMembers.id, row.id))
          }
          if (leaderAdded.length)
            await tx.insert(companyOrganizationUnitMembers).values(
              leaderAdded.map((item) => ({
                scopeType: 'company' as const,
                companyId: input.scope.companyId,
                treeId: context.tree.id,
                organizationUnitId: input.unitId,
                userId: item.userId,
                duty: item.duty,
              })),
            )
        } else {
          const projectId = input.scope.projectId
          if (removedIds.length)
            await tx
              .delete(projectOrganizationUnitMembers)
              .where(inArray(projectOrganizationUnitMembers.id, removedIds))
          for (const row of nonLeaderChanges) {
            await tx
              .update(projectOrganizationUnitMembers)
              .set({ duty: next.get(row.userId)!, updatedAt: new Date() })
              .where(eq(projectOrganizationUnitMembers.id, row.id))
          }
          if (nonLeaderAdded.length)
            await tx.insert(projectOrganizationUnitMembers).values(
              nonLeaderAdded.map((item) => ({
                scopeType: 'project' as const,
                companyId: input.scope.companyId,
                projectId,
                treeId: context.tree.id,
                organizationUnitId: input.unitId,
                userId: item.userId,
                duty: item.duty,
              })),
            )
          for (const row of leaderChanges) {
            await tx
              .update(projectOrganizationUnitMembers)
              .set({ duty: 'leader', updatedAt: new Date() })
              .where(eq(projectOrganizationUnitMembers.id, row.id))
          }
          if (leaderAdded.length)
            await tx.insert(projectOrganizationUnitMembers).values(
              leaderAdded.map((item) => ({
                scopeType: 'project' as const,
                companyId: input.scope.companyId,
                projectId,
                treeId: context.tree.id,
                organizationUnitId: input.unitId,
                userId: item.userId,
                duty: item.duty,
              })),
            )
        }
        const diff = relationDiff({
          previous: new Map([...previous].map(([id, row]) => [id, row.duty])),
          next: nextByUnitForEachMember,
          changed: (before, after) => before !== after,
        })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'organization.members.replace',
          objectType: 'organization_unit',
          objectId: input.unitId,
          summary: {
            direction: 'organizationUnit',
            organizationUnitId: input.unitId,
            beforeCount: previous.size,
            afterCount: next.size,
            ...diff,
          },
        })
        return this.unitMemberResult(tx, {
          scope: input.scope,
          organizationUnitId: input.unitId,
        })
      },
    )
  }
}
