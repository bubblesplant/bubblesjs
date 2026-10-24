import type { AccessContext, AccessPageDefinition, AccessScope, MenuNode } from 'shared/types'
import { accessRoutePath, filterSupportedAccessMenus, getAccessPage } from 'shared/utils'
import { SvgAssetIcon } from '@/components/Icon/SvgAsset'
import { tr } from '@/i18n'
import { pageComponents, type AccessPageComponent } from './bindings'

export type RegisteredPage = keyof typeof pageComponents

interface RegisteredPageDefinition extends Omit<AccessPageDefinition, 'title'> {
  fullPath: string
  title: () => string
  component: AccessPageComponent
}

// 按本地组件绑定顺序兜底选页，避免共享目录排序改变已有默认落点。
export const registeredRouteKeys = Object.keys(pageComponents) as RegisteredPage[]

/** 从共享目录解析组件绑定；注册错误在启动时失败，避免生成不可访问的路由。 */
function registerPage(routeKey: RegisteredPage): [RegisteredPage, RegisteredPageDefinition] {
  const definition = getAccessPage(routeKey)
  if (!definition) throw new Error(`页面组件绑定缺少共享目录定义：${routeKey}`)
  const scopePath = getAccessPage(`${definition.scopeType}.home`)?.path
  if (
    !scopePath ||
    (definition.path !== scopePath && !definition.path.startsWith(`${scopePath}/`))
  ) {
    throw new Error(`页面路径不属于当前作用域：${routeKey}`)
  }
  return [
    routeKey,
    {
      ...definition,
      fullPath: definition.path,
      path: definition.path === scopePath ? '' : definition.path.slice(scopePath.length + 1),
      title: () => tr(definition.title),
      component: pageComponents[routeKey],
    },
  ]
}

/** 本地组件绑定决定支持范围，服务端下发的 routeKey 不能动态 import 任意组件。 */
export const pageRegistry = Object.fromEntries(registeredRouteKeys.map(registerPage)) as Record<
  RegisteredPage,
  RegisteredPageDefinition
>

/** 仅为前端已注册的页面生成指定作用域路径，未知页面返回 null。 */
export function pagePath(scope: AccessScope, routeKey: string) {
  const page = pageRegistry[routeKey as RegisteredPage]
  return page ? accessRoutePath({ scope, routeKey }) : null
}

/** 优先按可见菜单顺序寻找授权页面，再从已注册页面中兜底选择。 */
export function firstAccessiblePagePath(context: AccessContext): string | null {
  /** 仅为拥有读取权限的页面生成当前工作空间路径。 */
  const allowedPath = (key: string) =>
    context.permissionKeys.includes(`${key}.read`) ? pagePath(context.scope, key) : null
  /** 深度优先遍历可见且启用的菜单，返回首个已授权页面路径。 */
  const visit = (nodes: MenuNode[]): string | null => {
    for (const node of nodes) {
      if (node.hidden || node.status !== 'active' || node.type === 'operation') continue
      const destination =
        node.type === 'page' ? allowedPath(node.routeKey ?? '') : visit(node.children)
      if (destination) return destination
    }
    return null
  }
  return (
    visit(context.menus) ??
    registeredRouteKeys.map(allowedPath).find((destination) => destination !== null) ??
    null
  )
}

interface NavigationItem {
  key: string
  name: string
  path?: string
  icon: ReactNode
  routes?: NavigationItem[]
}

/** 过滤未发布和不可见功能，将有效菜单递归转换为布局导航数据。 */
export function navigationTree(nodes: MenuNode[], scope: AccessScope): NavigationItem[] {
  return filterSupportedAccessMenus({
    menus: nodes,
    supportedRouteKeys: registeredRouteKeys,
  }).flatMap(
    /** 丢弃不可导航节点，解析页面路径或递归生成目录下的有效导航项。 */ (
      node,
    ): NavigationItem[] => {
      if (node.hidden || node.status !== 'active' || node.type === 'operation') return []
      const icon = <SvgAssetIcon name={node.icon} />
      if (node.type === 'page') {
        const path = pagePath(scope, node.routeKey ?? '')
        const page = pageRegistry[node.routeKey as RegisteredPage]
        return path ? [{ key: path, path, name: page?.title() ?? node.name, icon }] : []
      }
      const routes = navigationTree(node.children, scope)
      return routes.length ? [{ key: node.id, name: tr(node.name), icon, routes }] : []
    },
  )
}
