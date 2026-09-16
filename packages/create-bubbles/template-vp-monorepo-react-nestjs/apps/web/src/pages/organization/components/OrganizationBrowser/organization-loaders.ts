import type { OrganizationMemberCandidate, OrganizationUnitRecord } from 'shared/types'
import type { organizationApi } from '../../api'

/** 递归读取完整组织树，用于需要一次性列出全部父级的操作。 */
export async function loadAllOrganizationUnits(
  api: ReturnType<typeof organizationApi>,
  parentId?: string,
): Promise<OrganizationUnitRecord[]> {
  const result = await api.tree(parentId ? { parentId } : {})
  const descendants = await Promise.all(
    result.units
      .filter((unit) => unit.hasChildren)
      .map((unit) => loadAllOrganizationUnits(api, unit.id)),
  )
  return [...result.units, ...descendants.flat()]
}

/** 加载移动弹窗所需的全部可选父级，并排除正在移动的组织单元本身。 */
export async function loadOrganizationMoveOptions(
  api: ReturnType<typeof organizationApi>,
  movingUnitId: string,
) {
  const units = await loadAllOrganizationUnits(api)
  return units
    .filter((unit) => unit.id !== movingUnitId)
    .map((unit) => ({ value: unit.id, label: unit.fullPath }))
}

/** 分页读取指定组织单元的完整成员集合，供职责编辑器回填。 */
export async function loadOrganizationUnitMembers(
  api: ReturnType<typeof organizationApi>,
  unitId: string,
): Promise<OrganizationMemberCandidate[]> {
  const query = {
    purpose: 'browseOrganization' as const,
    organizationUnitIds: [unitId],
    includeDisabled: true,
    pageSize: 100,
  }
  const first = await api.memberCandidates({ ...query, page: 1 })
  const rest = await Promise.all(
    Array.from({ length: Math.ceil(first.total / 100) - 1 }, (_, index) =>
      api.memberCandidates({ ...query, page: index + 2 }),
    ),
  )
  return [...first.items, ...rest.flatMap((page) => page.items)]
}
