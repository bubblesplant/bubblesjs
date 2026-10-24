import type { ChangePasswordRequest, ChangePasswordResult, LogoutResult } from 'shared/types'
import { alovaRequest } from '@/utils/request'

/** 提交本人改密，成功正文不含密码，且不缓存或合并含密码的请求。 */
export const changePassword = (input: ChangePasswordRequest) =>
  alovaRequest.Post<ChangePasswordResult>('/auth/change-password', input, {
    cacheFor: 0,
    shareRequest: false,
    meta: { isShowErrorMessage: false },
  })

/** 请求服务端注销当前会话，禁用缓存和重复请求合并。 */
export const logout = () =>
  alovaRequest.Post<LogoutResult>('/auth/logout', undefined, {
    cacheFor: 0,
    shareRequest: false,
    meta: { isShowErrorMessage: false },
  })
