import type { ScopeType } from 'shared/types'
import RouteError from '@/pages/error/error'
import { lazyLoad } from '@/router/lazy-load'
import { accessMiddleware } from '@/router/middleware'
import { pageRegistry, registeredRouteKeys } from './registry'

/** 从共享首页路径派生作用域根路由，保留未替换的动态参数。 */
export function accessScopeRoutePath(scopeType: ScopeType): string {
  return pageRegistry[`${scopeType}.home`].fullPath
}

/** 将当前作用域的已发布组件统一转换为带权限校验、懒加载和错误边界的路由。 */
export function createAccessRoutes(scopeType: ScopeType): RouteObject[] {
  return registeredRouteKeys
    .filter((routeKey) => pageRegistry[routeKey].scopeType === scopeType)
    .map((routeKey): RouteObject => {
      const { path, component } = pageRegistry[routeKey]
      return {
        id: routeKey,
        ...(path ? { path } : { index: true }),
        element: lazyLoad(component.moduleName, component.leafPath),
        middleware: [accessMiddleware(routeKey)],
        errorElement: <RouteError />,
      }
    })
}
