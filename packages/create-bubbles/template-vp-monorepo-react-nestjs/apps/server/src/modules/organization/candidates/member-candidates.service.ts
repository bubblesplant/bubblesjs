import { Injectable } from '@nestjs/common'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { COMMON_ERRORS } from '@/common/error/common.error'
import { AppException } from '@/common/exceptions/app.exception'
import {
  companies,
  companyMembers,
  companyOrganizationUnitMembers,
  companyPositionMembers,
  organizationTrees,
  organizationUnits,
  positions,
  projectMembers,
  projectOrganizationUnitMembers,
  projectPositionMembers,
  projects,
  roles,
  userRoles,
  users,
} from '@/database/schema'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import {
  AccessService,
  type AccessActor,
  type AccessRequirement,
  type VerifiedAccess,
} from '@/modules/access/access.service'
import { pageWindow, scopeFilter, type AccessDb } from '@/modules/access/access.store'
import type {
  CandidateDisabledReason,
  OrganizationMemberCandidate,
  OrganizationMemberCandidatePurpose,
  OrganizationMemberCandidateQuery,
  OrganizationMemberIdentity,
  OrganizationScope,
  PageResult,
  ResolveOrganizationMemberCandidatesRequest,
} from 'shared/types'
import { normalizeOrganizationKey } from 'shared/utils'
import {
  deriveOrganizationUnits,
  organizationDutyOrder,
  organizationTreeFilter,
  positionScopeFilter,
} from '../organization.store'

interface CandidateState extends Omit<OrganizationMemberCandidate, 'disabled' | 'disabledReason'> {}

interface FilterContext {
  scope: OrganizationScope
  access: VerifiedAccess
  projectPermissions: Map<string, Set<string>>
  visibleProjectIds: Set<string>
}

const DISABLED_REASON_ORDER: CandidateDisabledReason[] = [
  'accountInactive',
  'scopeInactive',
  'memberInactive',
  'organizationInactive',
  'positionInactive',
]

/**
 * 判断身份是否属于本次候选筛选域。
 *
 * 企业端未指定 projectIds 时只以企业身份参与匹配；项目身份仍可在响应中展示，
 * 但不能影响未归属筛选或候选禁选状态。
 */
export function identityInCandidateFilterDomain(
  identity: OrganizationMemberIdentity,
  scope: OrganizationScope,
  query: OrganizationMemberCandidateQuery,
): boolean {
  if (scope.type === 'project')
    return (
      identity.scope.type === 'project' &&
      identity.scope.companyId === scope.companyId &&
      identity.scope.projectId === scope.projectId
    )
  if (query.projectIds)
    return (
      identity.scope.type === 'project' &&
      identity.scope.companyId === scope.companyId &&
      query.projectIds.includes(identity.scope.projectId)
    )
  return identity.scope.type === 'company' && identity.scope.companyId === scope.companyId
}

@Injectable()
export class MemberCandidatesService {
  constructor(private readonly access: AccessService) {}

  /** 根据用途构造基础权限要求；需要同时满足的附加权限在同一快照回调中检查。 */
  private requirement(input: {
    actor: AccessActor
    scope: OrganizationScope
    purpose: OrganizationMemberCandidatePurpose
  }): AccessRequirement {
    if (input.purpose === 'browseOrganization')
      return {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.organization.read`,
      }
    if (input.purpose === 'assignPositionMembers')
      return {
        actor: input.actor,
        scope: input.scope,
        permission: `${input.scope.type}.positions.read`,
      }
    if (input.purpose === 'addProjectMember') {
      if (input.scope.type !== 'project') throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
      return {
        actor: input.actor,
        scope: input.scope,
        permission: 'project.members.add',
      }
    }
    if (input.scope.type !== 'company') throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
    return {
      actor: input.actor,
      scope: input.scope,
      permission:
        input.purpose === 'createProjectAdministrator'
          ? 'company.projects.create'
          : 'company.projects.administrator',
      adminOnly: true,
    }
  }

  /** 拒绝与 purpose 不匹配的筛选字段，防止借低权限用途扩大身份信息暴露。 */
  private assertPurposeQuery(
    scope: OrganizationScope,
    query: OrganizationMemberCandidateQuery,
    purpose: OrganizationMemberCandidatePurpose,
  ) {
    if (scope.type === 'project' && query.projectIds !== undefined)
      throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
    if (purpose === 'assignPositionMembers') {
      if (
        query.organizationUnitIds !== undefined ||
        query.roleIds !== undefined ||
        query.projectIds !== undefined ||
        query.unassigned !== undefined
      )
        throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
      return
    }
    if (purpose === 'addProjectMember') {
      if (
        scope.type !== 'project' ||
        query.organizationUnitIds !== undefined ||
        query.positionIds !== undefined ||
        query.roleIds !== undefined ||
        query.projectIds !== undefined ||
        query.unassigned !== undefined
      )
        throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
      return
    }
    if (purpose === 'createProjectAdministrator' || purpose === 'setProjectAdministrator') {
      if (
        scope.type !== 'company' ||
        query.organizationUnitIds !== undefined ||
        query.positionIds !== undefined ||
        query.roleIds !== undefined ||
        query.projectIds !== undefined ||
        query.unassigned !== undefined
      )
        throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
    }
  }

  /** 要求访问上下文同时拥有指定权限，补足 AccessService 数组权限采用 OR 的语义。 */
  private requirePermission(access: VerifiedAccess, permission: string) {
    if (!access.permissionKeys.includes(permission)) throw new AppException(ACCESS_ERRORS.FORBIDDEN)
  }

  /** 把当前作用域成员装入按 userId 去重的候选集合，并建立基础身份。 */
  private async loadCurrentScopeCandidates(
    db: AccessDb,
    input: { scope: OrganizationScope; userIds?: string[] },
  ): Promise<Map<string, CandidateState>> {
    if (input.userIds?.length === 0) return new Map()
    if (input.scope.type === 'company') {
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, input.scope.companyId))
      const rows = await db
        .select({
          memberId: companyMembers.id,
          memberStatus: companyMembers.status,
          userId: users.id,
          account: users.account,
          name: users.name,
          accountStatus: users.status,
        })
        .from(companyMembers)
        .innerJoin(users, eq(users.id, companyMembers.userId))
        .where(
          and(
            eq(companyMembers.companyId, input.scope.companyId),
            input.userIds ? inArray(companyMembers.userId, input.userIds) : undefined,
          ),
        )
      return new Map(
        rows.map((row) => [
          row.userId,
          {
            userId: row.userId,
            account: row.account,
            name: row.name,
            accountStatus: row.accountStatus,
            identities: [
              {
                scope: input.scope,
                scopeName: company?.name ?? '',
                memberId: row.memberId,
                memberStatus: row.memberStatus,
                scopeStatus: company?.status ?? 'disabled',
                organizationUnits: [],
                positions: [],
                roles: [],
              },
            ],
          },
        ]),
      )
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.companyId, input.scope.companyId), eq(projects.id, input.scope.projectId)),
      )
    const rows = await db
      .select({
        memberId: projectMembers.id,
        memberStatus: projectMembers.status,
        userId: users.id,
        account: users.account,
        name: users.name,
        accountStatus: users.status,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(
        and(
          eq(projectMembers.companyId, input.scope.companyId),
          eq(projectMembers.projectId, input.scope.projectId),
          input.userIds ? inArray(projectMembers.userId, input.userIds) : undefined,
        ),
      )
    return new Map(
      rows.map((row) => [
        row.userId,
        {
          userId: row.userId,
          account: row.account,
          name: row.name,
          accountStatus: row.accountStatus,
          identities: [
            {
              scope: input.scope,
              scopeName: project?.name ?? '',
              memberId: row.memberId,
              memberStatus: row.memberStatus,
              scopeStatus: project?.status ?? 'disabled',
              organizationUnits: [],
              positions: [],
              roles: [],
            },
          ],
        },
      ]),
    )
  }

  /** 读取企业端调用者可见项目；企业管理员可见全部项目，其他成员沿用项目成员可见规则。 */
  private async visibleProjects(
    db: AccessDb,
    input: { companyId: string; actor: AccessActor; access: VerifiedAccess },
  ) {
    const rows = await db.select().from(projects).where(eq(projects.companyId, input.companyId))
    if (input.access.administrator === 'company') return rows
    const memberships = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.companyId, input.companyId),
          eq(projectMembers.userId, input.actor.userId),
        ),
      )
    const visibleIds = new Set(memberships.map((row) => row.projectId))
    return rows.filter((row) => visibleIds.has(row.id))
  }

  /** 逐项目计算实际权限；停用项目无法直接授权时只为企业管理员保留必要读取能力。 */
  private async projectPermissionMap(
    db: AccessDb,
    input: {
      companyId: string
      actor: AccessActor
      companyAccess: VerifiedAccess
      projectIds: string[]
    },
  ) {
    const result = new Map<string, Set<string>>()
    for (const projectId of input.projectIds) {
      try {
        const access = await this.access.authorize(db, {
          actor: input.actor,
          scope: { type: 'project', companyId: input.companyId, projectId },
        })
        result.set(projectId, new Set(access.permissionKeys))
      } catch (cause) {
        if (!(cause instanceof AppException)) throw cause
        if (
          cause.definition.code !== ACCESS_ERRORS.FORBIDDEN.code &&
          cause.definition.code !== ACCESS_ERRORS.NOT_FOUND.code
        )
          throw cause
        result.set(
          projectId,
          input.companyAccess.administrator === 'company'
            ? new Set(['project.organization.read', 'project.positions.read', 'project.roles.read'])
            : new Set(),
        )
      }
    }
    return result
  }

  /** 把可见项目成员身份追加到企业候选，身份基础信息不依赖项目组织、岗位或角色读取权。 */
  private async appendProjectIdentities(
    db: AccessDb,
    input: {
      companyId: string
      projects: Array<typeof projects.$inferSelect>
      candidates: Map<string, CandidateState>
    },
  ) {
    if (!input.projects.length || !input.candidates.size) return
    const projectById = new Map(input.projects.map((project) => [project.id, project]))
    const rows = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.companyId, input.companyId),
          inArray(
            projectMembers.projectId,
            input.projects.map((project) => project.id),
          ),
          inArray(projectMembers.userId, [...input.candidates.keys()]),
        ),
      )
    for (const row of rows) {
      const candidate = input.candidates.get(row.userId)
      const project = projectById.get(row.projectId)
      if (!candidate || !project) continue
      candidate.identities.push({
        scope: { type: 'project', companyId: input.companyId, projectId: project.id },
        scopeName: project.name,
        memberId: row.id,
        memberStatus: row.status,
        scopeStatus: project.status,
        organizationUnits: [],
        positions: [],
        roles: [],
      })
    }
  }

  /** 为一组同作用域身份加载获准公开的组织、岗位与角色标签。 */
  private async fillIdentityTags(
    db: AccessDb,
    input: {
      scope: OrganizationScope
      identities: Map<string, OrganizationMemberIdentity>
      organization: boolean
      position: boolean
      role: boolean
    },
  ) {
    const userIds = [...input.identities.keys()]
    if (!userIds.length) return
    if (input.organization) {
      const [tree] = await db
        .select()
        .from(organizationTrees)
        .where(organizationTreeFilter(input.scope))
      if (tree) {
        const units = await db
          .select()
          .from(organizationUnits)
          .where(eq(organizationUnits.treeId, tree.id))
        const byUnit = new Map(units.map((unit) => [unit.id, unit]))
        const derived = deriveOrganizationUnits(units)
        const memberships =
          input.scope.type === 'company'
            ? await db
                .select({
                  id: companyOrganizationUnitMembers.id,
                  organizationUnitId: companyOrganizationUnitMembers.organizationUnitId,
                  userId: companyOrganizationUnitMembers.userId,
                  duty: companyOrganizationUnitMembers.duty,
                })
                .from(companyOrganizationUnitMembers)
                .where(
                  and(
                    eq(companyOrganizationUnitMembers.companyId, input.scope.companyId),
                    eq(companyOrganizationUnitMembers.treeId, tree.id),
                    inArray(companyOrganizationUnitMembers.userId, userIds),
                  ),
                )
            : await db
                .select({
                  id: projectOrganizationUnitMembers.id,
                  organizationUnitId: projectOrganizationUnitMembers.organizationUnitId,
                  userId: projectOrganizationUnitMembers.userId,
                  duty: projectOrganizationUnitMembers.duty,
                })
                .from(projectOrganizationUnitMembers)
                .where(
                  and(
                    eq(projectOrganizationUnitMembers.companyId, input.scope.companyId),
                    eq(projectOrganizationUnitMembers.projectId, input.scope.projectId),
                    eq(projectOrganizationUnitMembers.treeId, tree.id),
                    inArray(projectOrganizationUnitMembers.userId, userIds),
                  ),
                )
        for (const membership of memberships) {
          const identity = input.identities.get(membership.userId)
          const unit = byUnit.get(membership.organizationUnitId)
          const fields = unit ? derived.get(unit.id) : undefined
          if (!identity || !unit || !fields) continue
          identity.organizationUnits.push({
            id: unit.id,
            membershipId: membership.id,
            name: unit.name,
            fullPath: fields.fullPath,
            status: unit.status,
            effective: fields.effective,
            duty: membership.duty,
          })
        }
      }
    }
    if (input.position) {
      const positionRows = await db.select().from(positions).where(positionScopeFilter(input.scope))
      const byPosition = new Map(positionRows.map((position) => [position.id, position]))
      const assignments =
        input.scope.type === 'company'
          ? await db
              .select({
                positionId: companyPositionMembers.positionId,
                userId: companyPositionMembers.userId,
              })
              .from(companyPositionMembers)
              .where(
                and(
                  eq(companyPositionMembers.companyId, input.scope.companyId),
                  inArray(companyPositionMembers.userId, userIds),
                ),
              )
          : await db
              .select({
                positionId: projectPositionMembers.positionId,
                userId: projectPositionMembers.userId,
              })
              .from(projectPositionMembers)
              .where(
                and(
                  eq(projectPositionMembers.companyId, input.scope.companyId),
                  eq(projectPositionMembers.projectId, input.scope.projectId),
                  inArray(projectPositionMembers.userId, userIds),
                ),
              )
      for (const assignment of assignments) {
        const identity = input.identities.get(assignment.userId)
        const position = byPosition.get(assignment.positionId)
        if (identity && position)
          identity.positions.push({ id: position.id, name: position.name, status: position.status })
      }
    }
    if (input.role) {
      const roleRows = await db
        .select({ userId: userRoles.userId, id: roles.id, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(scopeFilter(input.scope), inArray(userRoles.userId, userIds)))
      for (const row of roleRows) {
        const identity = input.identities.get(row.userId)
        if (identity) identity.roles.push({ id: row.id, name: row.name })
      }
    }
    for (const identity of input.identities.values()) {
      identity.organizationUnits.sort(
        (left, right) =>
          organizationDutyOrder(left.duty) - organizationDutyOrder(right.duty) ||
          left.membershipId.localeCompare(right.membershipId),
      )
      identity.positions.sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      )
      identity.roles.sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      )
    }
  }

  /** 返回候选中指定作用域的身份映射，供批量填充标签。 */
  private identitiesForScope(
    candidates: Map<string, CandidateState>,
    scope: OrganizationScope,
  ): Map<string, OrganizationMemberIdentity> {
    const result = new Map<string, OrganizationMemberIdentity>()
    for (const candidate of candidates.values()) {
      const identity = candidate.identities.find(
        (item) =>
          item.scope.type === scope.type &&
          item.scope.companyId === scope.companyId &&
          (scope.type === 'company' ||
            (item.scope.type === 'project' && item.scope.projectId === scope.projectId)),
      )
      if (identity) result.set(candidate.userId, identity)
    }
    return result
  }

  /**
   * 返回筛选资源所在范围的读取权限。
   * 当前企业或项目使用本次访问快照，企业视角下展开的其他项目使用逐项目权限快照。
   */
  private filterResourcePermissions(context: FilterContext, projectId: string | null) {
    if (
      projectId === null ||
      (context.scope.type === 'project' && projectId === context.scope.projectId)
    )
      return new Set(context.access.permissionKeys)
    return context.projectPermissions.get(projectId)
  }

  /** 校验所有筛选资源属于当前筛选域，并在确认归属后检查相应读取权限。 */
  private async validateFilters(
    db: AccessDb,
    input: { query: OrganizationMemberCandidateQuery; context: FilterContext },
  ) {
    const { query, context } = input
    const selectedProjectIds = query.projectIds ?? []
    if (selectedProjectIds.some((id) => !context.visibleProjectIds.has(id)))
      throw new AppException(ACCESS_ERRORS.NOT_FOUND)
    const projectDomain = context.scope.type === 'company' && selectedProjectIds.length > 0
    const scopeCondition = projectDomain
      ? and(
          eq(organizationTrees.scopeType, 'project'),
          eq(organizationTrees.companyId, context.scope.companyId),
          inArray(organizationTrees.projectId, selectedProjectIds),
        )
      : organizationTreeFilter(context.scope)
    if (query.organizationUnitIds) {
      const rows = await db
        .select({ id: organizationUnits.id, projectId: organizationTrees.projectId })
        .from(organizationUnits)
        .innerJoin(organizationTrees, eq(organizationTrees.id, organizationUnits.treeId))
        .where(and(scopeCondition, inArray(organizationUnits.id, query.organizationUnitIds)))
      if (rows.length !== query.organizationUnitIds.length)
        throw new AppException(ACCESS_ERRORS.NOT_FOUND)
      for (const row of rows) {
        const permission = this.filterResourcePermissions(context, row.projectId)
        if (!permission?.has(`${row.projectId ? 'project' : 'company'}.organization.read`))
          throw new AppException(ACCESS_ERRORS.FORBIDDEN)
      }
    }
    if (query.positionIds) {
      const rows = await db
        .select({ id: positions.id, projectId: positions.projectId })
        .from(positions)
        .where(
          and(
            projectDomain
              ? and(
                  eq(positions.scopeType, 'project'),
                  eq(positions.companyId, context.scope.companyId),
                  inArray(positions.projectId, selectedProjectIds),
                )
              : positionScopeFilter(context.scope),
            inArray(positions.id, query.positionIds),
          ),
        )
      if (rows.length !== query.positionIds.length) throw new AppException(ACCESS_ERRORS.NOT_FOUND)
      for (const row of rows) {
        const permission = this.filterResourcePermissions(context, row.projectId)
        if (!permission?.has(`${row.projectId ? 'project' : 'company'}.positions.read`))
          throw new AppException(ACCESS_ERRORS.FORBIDDEN)
      }
    }
    if (query.roleIds) {
      const rows = await db
        .select({ id: roles.id, projectId: roles.projectId })
        .from(roles)
        .where(
          and(
            projectDomain
              ? and(
                  eq(roles.scopeType, 'project'),
                  eq(roles.companyId, context.scope.companyId),
                  inArray(roles.projectId, selectedProjectIds),
                )
              : and(
                  eq(roles.scopeType, context.scope.type),
                  eq(roles.companyId, context.scope.companyId),
                  context.scope.type === 'project'
                    ? eq(roles.projectId, context.scope.projectId)
                    : isNull(roles.projectId),
                ),
            inArray(roles.id, query.roleIds),
          ),
        )
      if (rows.length !== query.roleIds.length) throw new AppException(ACCESS_ERRORS.NOT_FOUND)
      for (const row of rows) {
        const permission = this.filterResourcePermissions(context, row.projectId)
        if (!permission?.has(`${row.projectId ? 'project' : 'company'}.roles.read`))
          throw new AppException(ACCESS_ERRORS.FORBIDDEN)
      }
    }
    if (query.unassigned && projectDomain) {
      for (const projectId of selectedProjectIds) {
        if (!context.projectPermissions.get(projectId)?.has('project.organization.read'))
          throw new AppException(ACCESS_ERRORS.FORBIDDEN)
      }
    }
  }

  /** 判断一个身份是否同时满足所有身份类筛选；各数组内部为 OR，类别之间为 AND。 */
  private identityMatches(
    identity: OrganizationMemberIdentity,
    query: OrganizationMemberCandidateQuery,
  ) {
    if (query.projectIds) {
      if (identity.scope.type !== 'project' || !query.projectIds.includes(identity.scope.projectId))
        return false
    }
    if (
      query.organizationUnitIds &&
      !identity.organizationUnits.some((unit) => query.organizationUnitIds!.includes(unit.id))
    )
      return false
    if (
      query.positionIds &&
      !identity.positions.some((position) => query.positionIds!.includes(position.id))
    )
      return false
    if (query.roleIds && !identity.roles.some((role) => query.roleIds!.includes(role.id)))
      return false
    if (query.unassigned && identity.organizationUnits.length > 0) return false
    return true
  }

  /** 按固定优先级返回一个命中身份在当前用途下的首个禁选原因。 */
  private identityDisabledReason(
    candidate: CandidateState,
    identity: OrganizationMemberIdentity,
    query: OrganizationMemberCandidateQuery,
  ): CandidateDisabledReason {
    if (candidate.accountStatus !== 'active') return 'accountInactive'
    if (identity.scopeStatus !== 'active') return 'scopeInactive'
    if (identity.memberStatus !== 'active') return 'memberInactive'
    if (query.organizationUnitIds) {
      const matched = identity.organizationUnits.filter((unit) =>
        query.organizationUnitIds!.includes(unit.id),
      )
      if (matched.length && matched.every((unit) => !unit.effective)) return 'organizationInactive'
    }
    if (query.positionIds) {
      const matched = identity.positions.filter((position) =>
        query.positionIds!.includes(position.id),
      )
      if (matched.length && matched.every((position) => position.status !== 'active'))
        return 'positionInactive'
    }
    return null
  }

  /** 对聚合候选应用搜索、同身份筛选、禁选状态及稳定排序。 */
  private filterCandidates(
    candidates: Map<string, CandidateState>,
    query: OrganizationMemberCandidateQuery,
    scope: OrganizationScope,
  ): OrganizationMemberCandidate[] {
    const search = query.query?.trim()
    const normalizedSearch = search ? normalizeOrganizationKey(search) : undefined
    const targetUnitId =
      query.organizationUnitIds?.length === 1 ? query.organizationUnitIds[0] : undefined
    const results: Array<
      OrganizationMemberCandidate & { membershipSort?: { duty: number; id: string } }
    > = []
    for (const candidate of candidates.values()) {
      if (
        search &&
        !normalizeOrganizationKey(candidate.name).includes(normalizedSearch!) &&
        candidate.account.toLocaleLowerCase() !== search.toLocaleLowerCase()
      )
        continue
      const matchedIdentities = candidate.identities.filter(
        (identity) =>
          identityInCandidateFilterDomain(identity, scope, query) &&
          this.identityMatches(identity, query),
      )
      if (!matchedIdentities.length) continue
      const reasons = matchedIdentities.map((identity) =>
        this.identityDisabledReason(candidate, identity, query),
      )
      const disabled = !reasons.includes(null)
      const disabledReason = disabled
        ? (DISABLED_REASON_ORDER.find((reason) => reasons.includes(reason)) ?? null)
        : null
      if (query.includeDisabled === false && disabled) continue
      const membership = targetUnitId
        ? matchedIdentities
            .flatMap((identity) => identity.organizationUnits)
            .filter((unit) => unit.id === targetUnitId)
            .sort(
              (left, right) =>
                organizationDutyOrder(left.duty) - organizationDutyOrder(right.duty) ||
                left.membershipId.localeCompare(right.membershipId),
            )[0]
        : undefined
      results.push({
        ...candidate,
        identities: candidate.identities.sort((left, right) => {
          if (left.scope.type !== right.scope.type) return left.scope.type === 'company' ? -1 : 1
          return (
            left.scopeName.localeCompare(right.scopeName) ||
            left.memberId.localeCompare(right.memberId)
          )
        }),
        disabled,
        disabledReason,
        membershipSort: membership
          ? { duty: organizationDutyOrder(membership.duty), id: membership.membershipId }
          : undefined,
      })
    }
    results.sort((left, right) => {
      if (targetUnitId) {
        const leftMembership = left.membershipSort!
        const rightMembership = right.membershipSort!
        return (
          leftMembership.duty - rightMembership.duty ||
          leftMembership.id.localeCompare(rightMembership.id) ||
          left.userId.localeCompare(right.userId)
        )
      }
      return (
        normalizeOrganizationKey(left.name).localeCompare(normalizeOrganizationKey(right.name)) ||
        left.account.localeCompare(right.account) ||
        left.userId.localeCompare(right.userId)
      )
    })
    return results.map((result) => {
      const candidate = { ...result }
      delete candidate.membershipSort
      return candidate
    })
  }

  /** 在同一快照内聚合当前作用域及获准项目身份，并应用 purpose 对字段的最小化裁剪。 */
  private async collect(
    db: AccessDb,
    input: {
      actor: AccessActor
      access: VerifiedAccess
      scope: OrganizationScope
      query: OrganizationMemberCandidateQuery
      purpose: OrganizationMemberCandidatePurpose
      userIds?: string[]
    },
  ) {
    if (input.purpose === 'assignPositionMembers')
      this.requirePermission(input.access, `${input.scope.type}.positions.assign`)
    const sourceScope: OrganizationScope =
      input.purpose === 'addProjectMember' && input.scope.type === 'project'
        ? { type: 'company', companyId: input.scope.companyId }
        : input.scope
    const candidates = await this.loadCurrentScopeCandidates(db, {
      scope: sourceScope,
      userIds: input.userIds,
    })
    const currentIdentityMap = this.identitiesForScope(candidates, sourceScope)
    const currentOrganization = input.purpose === 'browseOrganization'
    const currentPosition =
      input.purpose === 'assignPositionMembers' ||
      (input.purpose === 'browseOrganization' &&
        input.access.permissionKeys.includes(`${input.scope.type}.positions.read`))
    const currentRole =
      input.purpose === 'browseOrganization' &&
      input.access.permissionKeys.includes(`${input.scope.type}.roles.read`)
    await this.fillIdentityTags(db, {
      scope: sourceScope,
      identities: currentIdentityMap,
      organization: currentOrganization,
      position: currentPosition,
      role: currentRole,
    })

    let visibleProjectRows: Array<typeof projects.$inferSelect> = []
    let projectPermissions = new Map<string, Set<string>>()
    if (
      input.scope.type === 'company' &&
      input.purpose === 'browseOrganization' &&
      input.access.permissionKeys.includes('company.projects.read')
    ) {
      visibleProjectRows = await this.visibleProjects(db, {
        companyId: input.scope.companyId,
        actor: input.actor,
        access: input.access,
      })
      projectPermissions = await this.projectPermissionMap(db, {
        companyId: input.scope.companyId,
        actor: input.actor,
        companyAccess: input.access,
        projectIds: visibleProjectRows.map((project) => project.id),
      })
      await this.appendProjectIdentities(db, {
        companyId: input.scope.companyId,
        projects: visibleProjectRows,
        candidates,
      })
      for (const project of visibleProjectRows) {
        const permissions = projectPermissions.get(project.id) ?? new Set<string>()
        await this.fillIdentityTags(db, {
          scope: { type: 'project', companyId: input.scope.companyId, projectId: project.id },
          identities: this.identitiesForScope(candidates, {
            type: 'project',
            companyId: input.scope.companyId,
            projectId: project.id,
          }),
          organization: permissions.has('project.organization.read'),
          position: permissions.has('project.positions.read'),
          role: permissions.has('project.roles.read'),
        })
      }
    } else if (input.query.projectIds !== undefined) {
      throw new AppException(ACCESS_ERRORS.FORBIDDEN)
    }

    if (input.purpose === 'browseOrganization' || input.purpose === 'assignPositionMembers')
      await this.validateFilters(db, {
        query: input.query,
        context: {
          scope: input.scope,
          access: input.access,
          projectPermissions,
          visibleProjectIds: new Set(visibleProjectRows.map((project) => project.id)),
        },
      })
    const effectiveQuery =
      input.purpose === 'addProjectMember'
        ? { ...input.query, includeDisabled: false as const }
        : input.query
    const result = this.filterCandidates(candidates, effectiveQuery, sourceScope)
    if (input.purpose !== 'addProjectMember' || input.scope.type !== 'project') return result
    if (!result.length) return result
    const existing = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.companyId, input.scope.companyId),
          eq(projectMembers.projectId, input.scope.projectId),
          inArray(
            projectMembers.userId,
            result.map(({ userId }) => userId),
          ),
        ),
      )
    const existingUserIds = new Set(existing.map(({ userId }) => userId))
    return result.filter(({ userId }) => !existingUserIds.has(userId))
  }

  /** 按用途鉴权后分页搜索组织成员候选。 */
  search(input: {
    actor: AccessActor
    scope: OrganizationScope
    query: OrganizationMemberCandidateQuery
  }): Promise<PageResult<OrganizationMemberCandidate>> {
    const purpose = input.query.purpose ?? 'browseOrganization'
    this.assertPurposeQuery(input.scope, input.query, purpose)
    return this.access.read(this.requirement({ ...input, purpose }), async (tx, access) => {
      const candidates = await this.collect(tx, { ...input, access, purpose })
      const { page, pageSize, offset } = pageWindow(input.query)
      return {
        items: candidates.slice(offset, offset + pageSize),
        total: candidates.length,
        page,
        pageSize,
      }
    })
  }

  /** 按请求 userId 顺序回显候选；项目加成员用途仍强制剔除失效身份和已有项目成员。 */
  resolve(input: {
    actor: AccessActor
    scope: OrganizationScope
    body: ResolveOrganizationMemberCandidatesRequest
  }): Promise<OrganizationMemberCandidate[]> {
    const purpose = input.body.purpose ?? 'browseOrganization'
    if (
      input.scope.type === 'project' &&
      (purpose === 'createProjectAdministrator' || purpose === 'setProjectAdministrator')
    )
      throw new AppException(COMMON_ERRORS.VALIDATION_FAILED)
    const query: OrganizationMemberCandidateQuery = { purpose, includeDisabled: true }
    return this.access.read(
      this.requirement({ actor: input.actor, scope: input.scope, purpose }),
      async (tx, access) => {
        const candidates = await this.collect(tx, {
          actor: input.actor,
          access,
          scope: input.scope,
          query,
          purpose,
          userIds: input.body.userIds,
        })
        const byUser = new Map(candidates.map((candidate) => [candidate.userId, candidate]))
        return input.body.userIds.flatMap((userId) => {
          const candidate = byUser.get(userId)
          return candidate ? [candidate] : []
        })
      },
    )
  }
}
