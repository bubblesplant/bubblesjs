import { tr } from '@/i18n'
import { firstAccessiblePagePath, type RegisteredPage } from '@/router/access-pages/registry'
import { scopeAccessContext } from './data'

/** 校验当前页面；首页失效时转向可用页面，叶子拒绝访问时保留父级导航。 */
export function accessMiddleware(routeKey: RegisteredPage): MiddlewareFunction {
  return /** 检查页面读取权限，首页可回退到其他授权页面，否则抛出访问拒绝。 */ async (
    { context },
    next,
  ) => {
    const access = context.get(scopeAccessContext)
    if (access.permissionKeys.includes(`${routeKey}.read`)) return

    // 首页撤权后仍可进入其他已授权页面；叶子页面错误保留已验证的父级空间。
    const destination = routeKey.endsWith('.home') ? firstAccessiblePagePath(access) : null
    // 零 loader 路由先完成空处理链，让错误归属当前叶子边界；此时页面尚未渲染。
    await next()
    if (destination) throw redirect(destination)
    throw Object.assign(new Error(tr('你没有访问此页面的权限，请联系管理员授权。')), {
      status: 403,
    })
  }
}
