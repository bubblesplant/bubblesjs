import { Injectable } from '@nestjs/common'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { AppException } from '@/common/exceptions/app.exception'
import {
  companyMembers,
  companyPositionMembers,
  positions,
  projectMembers,
  projectPositionMembers,
  users,
} from '@/database/schema'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import { AccessService, type AccessActor } from '@/modules/access/access.service'
import {
  checkVersion,
  pageWindow,
  requireFound,
  searchSql,
  type AccessDb,
  type AccessTx,
} from '@/modules/access/access.store'
import type {
  CreatePositionRequest,
  OrganizationScope,
  PageResult,
  PositionListQuery,
  PositionMemberRecord,
  PositionRecord,
  ReplaceMemberPositionsRequest,
  ReplaceMemberPositionsResult,
  ReplacePositionMembersRequest,
  ReplacePositionMembersResult,
  StatusRequest,
  UpdatePositionRequest,
} from 'shared/types'
import { normalizeOrganizationCode, normalizeOrganizationKey } from 'shared/utils'
import { positionScopeFilter, relationDiff } from '../organization.store'

interface ScopeMember {
  id: string
  userId: string
  account: string
  name: string
  status: 'active' | 'disabled'
  accountStatus: 'active' | 'locked' | 'disabled'
}

interface AssignmentRow {
  id: string
  positionId: string
  userId: string
  createdAt: Date
}

@Injectable()
export class PositionsService {
  constructor(private readonly access: AccessService) {}

  /** 在完整企业或项目作用域内查找岗位，跨租户 ID 统一返回不存在。 */
  private async positionRow(db: AccessDb, scope: OrganizationScope, positionId: string) {
    const [row] = await db
      .select()
      .from(positions)
      .where(and(positionScopeFilter(scope), eq(positions.id, positionId)))
    return requireFound(row)
  }

  /** 统计岗位当前任职人数，并将数据库时间字段转换为公开接口格式。 */
  private async positionRecord(
    db: AccessDb,
    scope: OrganizationScope,
    row: typeof positions.$inferSelect,
  ): Promise<PositionRecord> {
    const [total] =
      scope.type === 'company'
        ? await db
            .select({ value: count() })
            .from(companyPositionMembers)
            .where(
              and(
                eq(companyPositionMembers.companyId, scope.companyId),
                eq(companyPositionMembers.positionId, row.id),
              ),
            )
        : await db
            .select({ value: count() })
            .from(projectPositionMembers)
            .where(
              and(
                eq(projectPositionMembers.companyId, scope.companyId),
                eq(projectPositionMembers.projectId, scope.projectId),
                eq(projectPositionMembers.positionId, row.id),
              ),
            )
    return {
      id: row.id,
      scope,
      name: row.name,
      code: row.code,
      description: row.description,
      status: row.status,
      version: row.version,
      memberCount: total?.value ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** 按当前作用域读取成员与账号状态，用于判断是否允许新增任职。 */
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

  /** 查询按成员或岗位限定的任职，并统一企业和项目关系表的字段形状。 */
  private async assignments(
    db: AccessDb,
    input: { scope: OrganizationScope; userId?: string; positionId?: string },
  ): Promise<AssignmentRow[]> {
    if (input.scope.type === 'company') {
      return db
        .select({
          id: companyPositionMembers.id,
          positionId: companyPositionMembers.positionId,
          userId: companyPositionMembers.userId,
          createdAt: companyPositionMembers.createdAt,
        })
        .from(companyPositionMembers)
        .where(
          and(
            eq(companyPositionMembers.companyId, input.scope.companyId),
            input.userId ? eq(companyPositionMembers.userId, input.userId) : undefined,
            input.positionId ? eq(companyPositionMembers.positionId, input.positionId) : undefined,
          ),
        )
    }
    return db
      .select({
        id: projectPositionMembers.id,
        positionId: projectPositionMembers.positionId,
        userId: projectPositionMembers.userId,
        createdAt: projectPositionMembers.createdAt,
      })
      .from(projectPositionMembers)
      .where(
        and(
          eq(projectPositionMembers.companyId, input.scope.companyId),
          eq(projectPositionMembers.projectId, input.scope.projectId),
          input.userId ? eq(projectPositionMembers.userId, input.userId) : undefined,
          input.positionId ? eq(projectPositionMembers.positionId, input.positionId) : undefined,
        ),
      )
  }

  /** 只有有效账号、有效成员才能新增有效岗位任职；已有任职仍可保留或移除。 */
  private assertAssignmentAllowed(member: ScopeMember, positionStatus: 'active' | 'disabled') {
    if (
      member.accountStatus !== 'active' ||
      member.status !== 'active' ||
      positionStatus !== 'active'
    )
      throw new AppException(ACCESS_ERRORS.INVALID_MEMBER_RELATION)
  }

  /** 将某成员的岗位集合增删写入正确关系表，同时保留未变化任职 ID。 */
  private async persistMemberAssignments(
    tx: AccessTx,
    input: {
      scope: OrganizationScope
      userId: string
      previous: Map<string, AssignmentRow>
      next: Set<string>
    },
  ) {
    const removedIds = [...input.previous.values()]
      .filter((row) => !input.next.has(row.positionId))
      .map((row) => row.id)
    const addedIds = [...input.next].filter((positionId) => !input.previous.has(positionId))
    if (input.scope.type === 'company') {
      if (removedIds.length)
        await tx
          .delete(companyPositionMembers)
          .where(inArray(companyPositionMembers.id, removedIds))
      if (addedIds.length)
        await tx.insert(companyPositionMembers).values(
          addedIds.map((positionId) => ({
            scopeType: 'company' as const,
            companyId: input.scope.companyId,
            positionId,
            userId: input.userId,
          })),
        )
      return
    }
    if (removedIds.length)
      await tx.delete(projectPositionMembers).where(inArray(projectPositionMembers.id, removedIds))
    const projectId = input.scope.projectId
    if (addedIds.length)
      await tx.insert(projectPositionMembers).values(
        addedIds.map((positionId) => ({
          scopeType: 'project' as const,
          companyId: input.scope.companyId,
          projectId,
          positionId,
          userId: input.userId,
        })),
      )
  }

  /** 返回成员的完整岗位集合，使用岗位列表的稳定时间倒序。 */
  private async memberPositionResult(
    db: AccessDb,
    input: { scope: OrganizationScope; userId: string },
  ): Promise<ReplaceMemberPositionsResult> {
    const assignments = await this.assignments(db, input)
    if (!assignments.length) return { userId: input.userId, positions: [] }
    const rows = await db
      .select()
      .from(positions)
      .where(
        and(
          positionScopeFilter(input.scope),
          inArray(
            positions.id,
            assignments.map((row) => row.positionId),
          ),
        ),
      )
      .orderBy(desc(positions.createdAt), desc(positions.id))
    return {
      userId: input.userId,
      positions: await Promise.all(rows.map((row) => this.positionRecord(db, input.scope, row))),
    }
  }

  /** 返回岗位的完整成员集合，稳定按任职 ID 排序。 */
  private async positionMemberResult(
    db: AccessDb,
    input: { scope: OrganizationScope; positionId: string },
  ): Promise<ReplacePositionMembersResult> {
    const assignments = await this.assignments(db, input)
    const members = await this.scopeMembers(
      db,
      input.scope,
      assignments.map((row) => row.userId),
    )
    const records: PositionMemberRecord[] = assignments
      .map((assignment) => {
        const member = requireFound(members.get(assignment.userId))
        return {
          assignmentId: assignment.id,
          member: {
            id: member.id,
            userId: member.userId,
            account: member.account,
            name: member.name,
            status: member.status,
            accountStatus: member.accountStatus,
          },
          createdAt: assignment.createdAt.toISOString(),
        }
      })
      .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId))
    return { positionId: input.positionId, members: records }
  }

  /** 按作用域、状态和关键词分页读取岗位，返回实时任职人数。 */
  list(input: {
    actor: AccessActor
    scope: OrganizationScope
    query: PositionListQuery
  }): Promise<PageResult<PositionRecord>> {
    return this.access.read(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.positions.read`,
      },
      async (tx) => {
        const { page, pageSize, offset } = pageWindow(input.query)
        const condition = and(
          positionScopeFilter(input.scope),
          input.query.status ? eq(positions.status, input.query.status) : undefined,
          searchSql([positions.name, positions.code], input.query.query),
        )
        const [total] = await tx.select({ value: count() }).from(positions).where(condition)
        const rows = await tx
          .select()
          .from(positions)
          .where(condition)
          .orderBy(desc(positions.createdAt), desc(positions.id))
          .limit(pageSize)
          .offset(offset)
        return {
          items: await Promise.all(rows.map((row) => this.positionRecord(tx, input.scope, row))),
          total: total?.value ?? 0,
          page,
          pageSize,
        }
      },
    )
  }

  /** 创建作用域内平面岗位，并按规范键校验名称和编码唯一。 */
  create(input: { actor: AccessActor; scope: OrganizationScope; body: CreatePositionRequest }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.positions.create`,
      },
      async (tx, access) => {
        const nameKey = normalizeOrganizationKey(input.body.name)
        const codeKey = normalizeOrganizationCode(input.body.code)
        const [duplicate] = await tx
          .select({ id: positions.id })
          .from(positions)
          .where(
            and(
              positionScopeFilter(input.scope),
              sql`${positions.nameKey} = ${nameKey} OR ${positions.codeKey} = ${codeKey}`,
            ),
          )
          .limit(1)
        if (duplicate) throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
        const [created] = await tx
          .insert(positions)
          .values({
            scopeType: input.scope.type,
            companyId: input.scope.companyId,
            projectId: input.scope.type === 'project' ? input.scope.projectId : null,
            name: input.body.name,
            nameKey,
            code: input.body.code,
            codeKey,
            description: input.body.description ?? '',
          })
          .returning()
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'position.create',
          objectType: 'position',
          objectId: created!.id,
        })
        return this.positionRecord(tx, input.scope, created!)
      },
    )
  }

  /** 更新岗位资料并递增版本，关系集合保持不变。 */
  update(input: {
    actor: AccessActor
    scope: OrganizationScope
    positionId: string
    body: UpdatePositionRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.positions.update`,
      },
      async (tx, access) => {
        const existing = await this.positionRow(tx, input.scope, input.positionId)
        checkVersion(existing.version, input.body.expectedVersion)
        const nameKey = input.body.name ? normalizeOrganizationKey(input.body.name) : undefined
        const codeKey = input.body.code ? normalizeOrganizationCode(input.body.code) : undefined
        if (nameKey || codeKey) {
          const [duplicate] = await tx
            .select({ id: positions.id })
            .from(positions)
            .where(
              and(
                positionScopeFilter(input.scope),
                sql`${positions.id} <> ${input.positionId}`,
                sql`${nameKey ? sql`${positions.nameKey} = ${nameKey}` : sql`false`} OR ${
                  codeKey ? sql`${positions.codeKey} = ${codeKey}` : sql`false`
                }`,
              ),
            )
            .limit(1)
          if (duplicate) throw new AppException(ACCESS_ERRORS.DUPLICATE_RESOURCE)
        }
        const { expectedVersion: _, ...changes } = input.body
        const [updated] = await tx
          .update(positions)
          .set({
            ...changes,
            ...(nameKey ? { nameKey } : {}),
            ...(codeKey ? { codeKey } : {}),
            version: sql`${positions.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(positionScopeFilter(input.scope), eq(positions.id, input.positionId)))
          .returning()
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'position.update',
          objectType: 'position',
          objectId: input.positionId,
          summary: { changedFields: Object.keys(changes) },
        })
        return this.positionRecord(tx, input.scope, requireFound(updated))
      },
    )
  }

  /** 启停岗位并保留已有任职，后续新增任职会重新校验岗位状态。 */
  status(input: {
    actor: AccessActor
    scope: OrganizationScope
    positionId: string
    body: StatusRequest
  }) {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.positions.update`,
      },
      async (tx, access) => {
        const existing = await this.positionRow(tx, input.scope, input.positionId)
        checkVersion(existing.version, input.body.expectedVersion)
        const [updated] = await tx
          .update(positions)
          .set({
            status: input.body.status,
            version: sql`${positions.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(positionScopeFilter(input.scope), eq(positions.id, input.positionId)))
          .returning()
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'position.status',
          objectType: 'position',
          objectId: input.positionId,
          summary: { fromStatus: existing.status, toStatus: input.body.status },
        })
        return this.positionRecord(tx, input.scope, requireFound(updated))
      },
    )
  }

  /** 按成员全量替换岗位任职，停用成员或岗位的旧关系只允许保留或移除。 */
  replaceMemberPositions(input: {
    actor: AccessActor
    scope: OrganizationScope
    userId: string
    body: ReplaceMemberPositionsRequest
  }): Promise<ReplaceMemberPositionsResult> {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.positions.assign`,
      },
      async (tx, access) => {
        const member = requireFound(
          (await this.scopeMembers(tx, input.scope, [input.userId])).get(input.userId),
        )
        const previousRows = await this.assignments(tx, {
          scope: input.scope,
          userId: input.userId,
        })
        const previous = new Map(previousRows.map((row) => [row.positionId, row]))
        const next = new Set(input.body.positionIds)
        const requestedRows = next.size
          ? await tx
              .select()
              .from(positions)
              .where(and(positionScopeFilter(input.scope), inArray(positions.id, [...next])))
          : []
        if (requestedRows.length !== next.size) throw new AppException(ACCESS_ERRORS.NOT_FOUND)
        for (const row of requestedRows) {
          if (!previous.has(row.id)) this.assertAssignmentAllowed(member, row.status)
        }
        await this.persistMemberAssignments(tx, {
          scope: input.scope,
          userId: input.userId,
          previous,
          next,
        })
        const diff = relationDiff({
          previous: new Map([...previous.keys()].map((id) => [id, true])),
          next: new Map([...next].map((id) => [id, true])),
        })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'position.members.replace',
          objectType: 'position_member',
          objectId: input.userId,
          summary: {
            direction: 'member',
            targetUserId: input.userId,
            beforeCount: previous.size,
            afterCount: next.size,
            ...diff,
          },
        })
        return this.memberPositionResult(tx, { scope: input.scope, userId: input.userId })
      },
    )
  }

  /** 按岗位全量替换成员集合，只影响该岗位且保留成员的其他任职。 */
  replacePositionMembers(input: {
    actor: AccessActor
    scope: OrganizationScope
    positionId: string
    body: ReplacePositionMembersRequest
  }): Promise<ReplacePositionMembersResult> {
    return this.access.write(
      {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.positions.assign`,
      },
      async (tx, access) => {
        const position = await this.positionRow(tx, input.scope, input.positionId)
        const previousRows = await this.assignments(tx, {
          scope: input.scope,
          positionId: input.positionId,
        })
        const previous = new Map(previousRows.map((row) => [row.userId, row]))
        const next = new Set(input.body.userIds)
        const members = await this.scopeMembers(tx, input.scope, [...next])
        if (members.size !== next.size) throw new AppException(ACCESS_ERRORS.NOT_FOUND)
        for (const userId of next) {
          if (!previous.has(userId))
            this.assertAssignmentAllowed(members.get(userId)!, position.status)
        }
        const removedIds = previousRows.filter((row) => !next.has(row.userId)).map((row) => row.id)
        const addedUserIds = [...next].filter((userId) => !previous.has(userId))
        if (input.scope.type === 'company') {
          if (removedIds.length)
            await tx
              .delete(companyPositionMembers)
              .where(inArray(companyPositionMembers.id, removedIds))
          if (addedUserIds.length)
            await tx.insert(companyPositionMembers).values(
              addedUserIds.map((userId) => ({
                scopeType: 'company' as const,
                companyId: input.scope.companyId,
                positionId: input.positionId,
                userId,
              })),
            )
        } else {
          const projectId = input.scope.projectId
          if (removedIds.length)
            await tx
              .delete(projectPositionMembers)
              .where(inArray(projectPositionMembers.id, removedIds))
          if (addedUserIds.length)
            await tx.insert(projectPositionMembers).values(
              addedUserIds.map((userId) => ({
                scopeType: 'project' as const,
                companyId: input.scope.companyId,
                projectId,
                positionId: input.positionId,
                userId,
              })),
            )
        }
        const diff = relationDiff({
          previous: new Map([...previous.keys()].map((id) => [id, true])),
          next: new Map([...next].map((id) => [id, true])),
        })
        await this.access.audit(tx, {
          actor: input.actor,
          access,
          action: 'position.members.replace',
          objectType: 'position',
          objectId: input.positionId,
          summary: {
            direction: 'position',
            positionId: input.positionId,
            beforeCount: previous.size,
            afterCount: next.size,
            ...diff,
          },
        })
        return this.positionMemberResult(tx, {
          scope: input.scope,
          positionId: input.positionId,
        })
      },
    )
  }
}
