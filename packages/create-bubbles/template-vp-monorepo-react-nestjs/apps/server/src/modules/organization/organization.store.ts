import { and, eq, isNull } from 'drizzle-orm'
import { AppException } from '@/common/exceptions/app.exception'
import { organizationTrees, organizationUnits, positions } from '@/database/schema'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import type { OrganizationDuty, OrganizationScope, OrganizationUnitRecord } from 'shared/types'
import { ORGANIZATION_MAX_SORT } from 'shared/utils'

export type OrganizationUnitRow = typeof organizationUnits.$inferSelect

export interface OrganizationUnitDerivedFields {
  depth: number
  fullPath: string
  effective: boolean
  hasChildren: boolean
}

/** 将企业或项目组织作用域转换为新领域表使用的非空租户列。 */
export function organizationScopeColumns(scope: OrganizationScope) {
  return {
    scopeType: scope.type,
    companyId: scope.companyId,
    projectId: scope.type === 'project' ? scope.projectId : null,
  }
}

/** 构造组织树的完整企业或项目归属条件，避免裸 ID 跨租户读取。 */
export function organizationTreeFilter(scope: OrganizationScope) {
  return and(
    eq(organizationTrees.scopeType, scope.type),
    eq(organizationTrees.companyId, scope.companyId),
    scope.type === 'project'
      ? eq(organizationTrees.projectId, scope.projectId)
      : isNull(organizationTrees.projectId),
  )
}

/** 构造岗位的完整企业或项目归属条件。 */
export function positionScopeFilter(scope: OrganizationScope) {
  return and(
    eq(positions.scopeType, scope.type),
    eq(positions.companyId, scope.companyId),
    scope.type === 'project'
      ? eq(positions.projectId, scope.projectId)
      : isNull(positions.projectId),
  )
}

/**
 * 根据整棵树的父子关系计算路径、深度、有效状态和直接子节点标记。
 *
 * 数据库只保存结构字段，这些值必须在同一读取快照中派生；若检测到历史脏数据形成循环，
 * 以领域循环错误终止查询，避免递归失控或返回错误路径。
 */
export function deriveOrganizationUnits(
  rows: OrganizationUnitRow[],
): Map<string, OrganizationUnitDerivedFields> {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const childCounts = new Map<string, number>()
  for (const row of rows) {
    if (row.parentId) childCounts.set(row.parentId, (childCounts.get(row.parentId) ?? 0) + 1)
  }

  const result = new Map<string, OrganizationUnitDerivedFields>()
  const visiting = new Set<string>()
  /** 递归解析一个节点，并复用已经完成的祖先计算结果。 */
  const resolve = (row: OrganizationUnitRow): OrganizationUnitDerivedFields => {
    const cached = result.get(row.id)
    if (cached) return cached
    if (visiting.has(row.id)) throw new AppException(ACCESS_ERRORS.ORGANIZATION_CYCLE)
    visiting.add(row.id)
    const parent = row.parentId ? byId.get(row.parentId) : undefined
    const parentDerived = parent ? resolve(parent) : undefined
    const derived = {
      depth: (parentDerived?.depth ?? 0) + 1,
      fullPath: parentDerived ? `${parentDerived.fullPath} / ${row.name}` : row.name,
      effective: row.status === 'active' && (parentDerived?.effective ?? true),
      hasChildren: (childCounts.get(row.id) ?? 0) > 0,
    }
    visiting.delete(row.id)
    result.set(row.id, derived)
    return derived
  }
  for (const row of rows) resolve(row)
  return result
}

/** 将组织单元数据库记录和派生路径信息转换为公开接口记录。 */
export function toOrganizationUnitRecord(
  row: OrganizationUnitRow,
  derived: OrganizationUnitDerivedFields,
): OrganizationUnitRecord {
  return {
    id: row.id,
    treeId: row.treeId,
    parentId: row.parentId,
    name: row.name,
    code: row.code,
    description: row.description,
    sort: row.sort,
    status: row.status,
    version: row.version,
    depth: derived.depth,
    fullPath: derived.fullPath,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 返回同级末尾的下一个排序整数；最大值耗尽时抛出明确业务错误。 */
export function nextOrganizationSort(rows: Array<{ sort: number }>): number {
  const maximum = rows.reduce((value, row) => Math.max(value, row.sort), 0)
  if (maximum >= ORGANIZATION_MAX_SORT)
    throw new AppException(ACCESS_ERRORS.ORGANIZATION_SORT_EXHAUSTED)
  return maximum + 1
}

/** 按负责人、协助负责人、普通成员的固定优先级返回关系排序值。 */
export function organizationDutyOrder(duty: OrganizationDuty): number {
  return duty === 'leader' ? 0 : duty === 'deputy' ? 1 : 2
}

/** 判断职责变化是否属于需要有效成员和有效组织单元的升级。 */
export function isOrganizationDutyUpgrade(
  previous: OrganizationDuty | undefined,
  next: OrganizationDuty,
): boolean {
  if (!previous) return true
  const rank: Record<OrganizationDuty, number> = { member: 0, deputy: 1, leader: 2 }
  return rank[next] > rank[previous]
}

/** 统计集合替换中的新增、移除和保留项变化，供审计摘要复用。 */
export function relationDiff<T>(input: {
  previous: Map<string, T>
  next: Map<string, T>
  changed?: (before: T, after: T) => boolean
}) {
  let addedCount = 0
  let removedCount = 0
  let changedCount = 0
  for (const [key, value] of input.next) {
    const oldValue = input.previous.get(key)
    if (oldValue === undefined) addedCount += 1
    else if (input.changed?.(oldValue, value)) changedCount += 1
  }
  for (const key of input.previous.keys()) {
    if (!input.next.has(key)) removedCount += 1
  }
  return { addedCount, removedCount, changedCount }
}
