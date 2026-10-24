import { message } from 'antd'
import { cookie } from '@/utils/storage/cookie'
import { removeWorkspaceSnapshot } from '@/store/user/persistence'
import { removeDictionarySnapshot } from '@/store/dictionary/persistence'

let unauthorizedHandled = false

/** 清理本地会话并提示登录失效；按需加载路由，避免请求实例初始化时循环依赖。 */
export function unAuthorizedResponseFunc() {
  if (unauthorizedHandled) {
    return
  }
  unauthorizedHandled = true
  cookie.remove('token')
  // store 尚未加载时也删除旧快照；会话事件负责清理已加载的内存及在途操作。
  removeWorkspaceSnapshot()
  removeDictionarySnapshot()
  message.error('登录过期或未登录')
  void import('@/router').then(({ navigator }) => navigator('/login'))
}

/** 新会话建立后允许后续登录失效再次提示与导航，由会话入口决定调用时机。 */
export function resetUnauthorizedHandled() {
  unauthorizedHandled = false
}
