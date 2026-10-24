import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const effects = vi.hoisted(() => ({
  unauthorized: vi.fn(),
  errorMessage: vi.fn(),
  token: vi.fn(() => 'existing-session'),
}))
vi.mock('../../src/utils/env', () => ({ envVariables: { API_AFFIX: '' } }))
vi.mock('../../src/utils/storage/cookie', () => ({ cookie: { get: effects.token } }))
vi.mock('../../src/utils/request/utils', () => ({ unAuthorizedResponseFunc: effects.unauthorized }))
vi.mock('antd', () => ({ message: { error: effects.errorMessage } }))

import { login } from '../../src/pages/login/api'
import { register } from '../../src/pages/register/api'
import { createRequestServer } from './fixtures'

const fixture = createRequestServer()

beforeAll(() => fixture.start())
afterAll(() => fixture.close())
beforeEach(() => vi.clearAllMocks())

describe('公开认证请求隔离', () => {
  it.each([
    {
      name: '登录',
      create: () => login({ account: 'test-account', password: 'test-password' }),
    },
    {
      name: '注册',
      create: () =>
        register({ name: '测试用户', account: 'test-account', password: 'test-password' }),
    },
  ])('$name不附带已有令牌，真实 401 保留原生错误并交给表单', async ({ create }) => {
    const method = create()
    method.baseURL = fixture.baseURL

    await expect(method.send()).rejects.toMatchObject({
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      response: {
        status: 401,
        data: { message: '登录已失效，请重新登录', authorization: null },
      },
    })
    expect(effects.token).not.toHaveBeenCalled()
    expect(effects.unauthorized).not.toHaveBeenCalled()
    expect(effects.errorMessage).not.toHaveBeenCalled()
  })
})
