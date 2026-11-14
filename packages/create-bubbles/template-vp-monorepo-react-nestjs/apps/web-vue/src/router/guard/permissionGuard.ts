import type { Router } from 'vue-router'
import { isAxiosError } from 'axios'
import NProgress from 'nprogress'
import { accessScopeBasePath, accessScopeKey } from 'shared/utils'
import { useUserStoreWithOut } from '@/store/modules/user'
import { buildAuthPath } from '@/utils/safe-next'
import { cookie } from '@/utils/storage/cookie'
import { firstAccessiblePath, routeScope } from '../access'

/** 验证会话、空间成员身份和读取权限，保护直接地址访问。 */
export function createPermissionGuard(router: Router) {
  router.beforeEach(async (to) => {
    NProgress.start()
    if (to.meta.public) return true
    if (!cookie.get('token')) return buildAuthPath('/login', { next: to.fullPath })
    const store = useUserStoreWithOut()
    try {
      await store.loadWorkspaces()
      if (to.path === '/' || to.path === '/home') {
        return store.workspaces.length === 1
          ? accessScopeBasePath(store.workspaces[0]!.scope)
          : '/workspaces'
      }
      const scope = routeScope(to)
      if (!scope) {
        store.leaveWorkspace()
        return true
      }
      if (!store.workspaces.some((item) => accessScopeKey(item.scope) === accessScopeKey(scope)))
        return '/403'
      const access = await store.loadAccess(scope)
      const key = typeof to.meta.routeKey === 'string' ? to.meta.routeKey : ''
      if (key && !access.permissionKeys.includes(`${key}.read`)) {
        return key.endsWith('.home') ? (firstAccessiblePath(access) ?? '/403') : '/403'
      }
      return true
    } catch (error) {
      if ((error as Error).name === 'AbortError') return false
      const status = isAxiosError(error) ? error.response?.status : undefined
      if (status === 401) return buildAuthPath('/login', { next: to.fullPath })
      if (status === 403 || status === 404) return '/403'
      return {
        path: '/error',
        query: { next: to.fullPath },
      }
    }
  })
  router.afterEach(() => NProgress.done())
  router.onError(() => NProgress.done())
  /** 会话失效后保留安全的站内返回地址。 */
  function unauthorized() {
    const current = router.currentRoute.value
    if (!current.meta.public)
      void router.replace(buildAuthPath('/login', { next: current.fullPath }))
  }
  window.addEventListener('auth-unauthorized', unauthorized)
  /** 其他标签切换账号后重新选择已经验证的工作空间。 */
  function recheck() {
    void router.replace('/workspaces')
  }
  window.addEventListener('auth-session-recheck', recheck)
  import.meta.hot?.dispose(() => {
    window.removeEventListener('auth-unauthorized', unauthorized)
    window.removeEventListener('auth-session-recheck', recheck)
  })
}
