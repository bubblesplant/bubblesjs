import type { OrganizationScope, OrganizationUnitNode, PageResult } from 'shared/types'
import { organizationApi } from '@/views/organization/api'
/** 用于选择器的完整分页读取，避免保存时丢失后续页的既有关联。 */
export async function loadPages<T>(
  request: (page: number) => Promise<PageResult<T>>,
): Promise<T[]> {
  const first = await request(1)
  const pages = await Promise.all(
    Array.from(
      {
        length: Math.max(0, Math.ceil(first.total / first.pageSize) - 1),
      },
      (_, i) => request(i + 2),
    ),
  )
  return [...first.items, ...pages.flatMap((page) => page.items)]
}
/** 关联编辑器按父节点逐层读取，保留服务端组织路径。 */
export async function loadUnits(scope: OrganizationScope): Promise<OrganizationUnitNode[]> {
  const api = organizationApi(scope)
  /** 仅对存在子级的节点继续读取，组合为供关联选择的扁平列表。 */
  async function visit(parentId?: string): Promise<OrganizationUnitNode[]> {
    const result = await api.tree({ parentId })
    const descendants = await Promise.all(
      result.units.filter((unit) => unit.hasChildren).map((unit) => visit(unit.id)),
    )
    return [...result.units, ...descendants.flat()]
  }
  return visit()
}
