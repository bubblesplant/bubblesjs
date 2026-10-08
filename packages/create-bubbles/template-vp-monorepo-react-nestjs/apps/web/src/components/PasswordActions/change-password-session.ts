import type { ChangePasswordRequest, ChangePasswordResult } from 'shared/types'
import { clearWorkspaceRequests } from '@/utils/request/workspace'
import { cookie } from '@/utils/storage/cookie'

/** 只有服务端完成密码更新与全终端撤销后，才让本端旧请求和令牌失效。 */
export async function changePasswordAndClearSession(
  values: ChangePasswordRequest,
  send: (input: ChangePasswordRequest) => Promise<ChangePasswordResult>,
) {
  await send(values)
  clearWorkspaceRequests()
  cookie.remove('token')
}
