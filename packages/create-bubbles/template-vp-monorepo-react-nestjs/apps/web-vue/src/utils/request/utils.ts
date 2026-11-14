import { cookie } from '@/utils/storage/cookie'

/** 清除失效凭据并通知路由，避免请求模块与路由互相初始化。 */
export function unAuthorizedResponseFunc() {
  cookie.remove('token')
  window.dispatchEvent(new Event('auth-unauthorized'))
}
