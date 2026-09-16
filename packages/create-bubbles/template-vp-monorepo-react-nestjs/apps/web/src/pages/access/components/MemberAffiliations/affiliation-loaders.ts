import type { OrganizationUnitNode } from 'shared/types'
import type { organizationApi } from '@/pages/organization/api'

export { loadAllPositions } from '@/pages/positions/loaders'

/** 递归读取当前作用域完整组织树，供成员多组织关系编辑器使用。 */
export async function loadAllOrganizationUnits(
  api: ReturnType<typeof organizationApi>,
  parentId?: string,
): Promise<OrganizationUnitNode[]> {
  const result = await api.tree(parentId ? { parentId } : {})
  const descendants = await Promise.all(
    result.units
      .filter((unit) => unit.hasChildren)
      .map((unit) => loadAllOrganizationUnits(api, unit.id)),
  )
  return [...result.units, ...descendants.flat()]
}
