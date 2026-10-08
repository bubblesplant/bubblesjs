import { describe, expect, it, vi } from 'vite-plus/test'
import type { ChangePasswordRequest, ChangePasswordResult } from 'shared/types'

const session = vi.hoisted(() => ({ clear: vi.fn(), remove: vi.fn() }))
vi.mock('../src/utils/request/workspace', () => ({ clearWorkspaceRequests: session.clear }))
vi.mock('../src/utils/storage/cookie', () => ({ cookie: { remove: session.remove } }))

import { changePasswordAndClearSession } from '../src/components/PasswordActions/change-password-session'

const input: ChangePasswordRequest = {
  oldPassword: 'old-example',
  newPassword: 'new-example',
  confirmPassword: 'new-example',
}

describe('本人改密后的本地会话处理', () => {
  it('服务端确认成功后才撤销在途工作空间请求并删除本地令牌', async () => {
    const send = vi
      .fn<(values: ChangePasswordRequest) => Promise<ChangePasswordResult>>()
      .mockResolvedValue({ passwordChanged: true })

    await changePasswordAndClearSession(input, send)

    expect(send).toHaveBeenCalledWith(input)
    expect(session.clear).toHaveBeenCalledOnce()
    expect(session.remove).toHaveBeenCalledWith('token')
  })

  it('改密失败时保留仍有效的本地会话和在途请求', async () => {
    session.clear.mockClear()
    session.remove.mockClear()
    const error = new Error('旧密码错误')
    const send = vi.fn().mockRejectedValue(error)

    await expect(changePasswordAndClearSession(input, send)).rejects.toBe(error)

    expect(session.clear).not.toHaveBeenCalled()
    expect(session.remove).not.toHaveBeenCalled()
  })
})
