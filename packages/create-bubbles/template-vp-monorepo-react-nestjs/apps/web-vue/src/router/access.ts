import type { AccessContext, AccessScope, MenuNode } from 'shared/types'
import type { RouteLocationNormalized } from 'vue-router'
import { ACCESS_PAGE_CATALOG, accessRoutePath, filterSupportedAccessMenus } from 'shared/utils'

const implementedFeatures = new Set([
  'home',
  'companies',
  'projects',
  'accounts',
  'members',
  'roles',
  'profile',
  'audit',
  'menus',
  'dictionaries',
  'organization',
  'positions',
  'templates',
])
export const supportedPages = ACCESS_PAGE_CATALOG.filter((page) =>
  implementedFeatures.has(page.routeKey.split('.').at(-1) ?? ''),
)
export const supportedRouteKeys = supportedPages.map((page) => page.routeKey)

/** 从路由参数构造空间，不依赖上次选择。 */
export function routeScope(
  route: Pick<RouteLocationNormalized, 'meta' | 'params'>,
): AccessScope | null {
  if (route.meta.scopeType === 'platform') return { type: 'platform' }
  const companyId = String(route.params.companyId ?? '')
  if (route.meta.scopeType === 'project') {
    return {
      type: 'project',
      companyId,
      projectId: String(route.params.projectId ?? ''),
    }
  }
  return route.meta.scopeType === 'company' ? { type: 'company', companyId } : null
}

/** 过滤隐藏、停用及未授权菜单。 */
export function navigationMenus(access: AccessContext): MenuNode[] {
  /** 递归保留有效目录及已发布、已授权页面。 */
  function visit(nodes: MenuNode[]): MenuNode[] {
    return nodes.flatMap((node) => {
      if (node.hidden || node.status !== 'active' || node.type === 'operation') return []
      const children = visit(node.children)
      if (node.type === 'directory') {
        return children.length ? [{ ...node, children }] : []
      }
      return access.permissionKeys.includes(`${node.routeKey}.read`) ? [{ ...node, children }] : []
    })
  }
  return visit(filterSupportedAccessMenus({ menus: access.menus, supportedRouteKeys }))
}

/** 按菜单顺序选择可访问页面，缺少菜单时从发布目录兜底。 */
export function firstAccessiblePath(access: AccessContext): string | null {
  /** 查找目录中的第一个页面。 */
  function visit(nodes: MenuNode[]): string | null {
    for (const node of nodes) {
      const path = node.routeKey
        ? accessRoutePath({ scope: access.scope, routeKey: node.routeKey })
        : visit(node.children)
      if (path) return path
    }
    return null
  }
  const page = supportedPages.find(
    (item) =>
      item.scopeType === access.scope.type && access.permissionKeys.includes(item.permissionKey),
  )
  return (
    visit(navigationMenus(access)) ??
    (page ? accessRoutePath({ scope: access.scope, routeKey: page.routeKey }) : null)
  )
}
