// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { LoginRequest } from 'shared/types'

const effects = vi.hoisted(() => ({
  send: vi.fn(),
  navigate: vi.fn(),
  expiredNavigate: vi.fn(),
  errorMessage: vi.fn(),
  submit: undefined as ((values: LoginRequest) => Promise<boolean>) | undefined,
}))
vi.mock('alova/client', () => ({ useRequest: () => ({ send: effects.send, loading: false }) }))
vi.mock('../../src/pages/login/api', () => ({ login: vi.fn() }))
vi.mock('../../src/router', () => ({ navigator: effects.expiredNavigate }))
vi.mock('@bubblesjs/i18n-react', () => ({ useI18n: () => ({ tr: (text: string) => text }) }))
vi.mock('../../src/components/Brand/Brand', () => ({ default: () => null }))
vi.mock('../../src/components/LocaleSwitch/LocaleSwitch', () => ({ default: () => null }))
vi.mock('@ant-design/icons', () => ({
  ArrowRightOutlined: () => null,
  LockOutlined: () => null,
  UserOutlined: () => null,
}))
vi.mock('@ant-design/pro-components', () => ({
  LoginForm: ({ onFinish, children }: { onFinish: typeof effects.submit; children: ReactNode }) => {
    effects.submit = onFinish
    return children
  },
  ProFormText: Object.assign(() => null, { Password: () => null }),
}))
vi.mock('antd', () => ({
  message: { error: effects.errorMessage },
  Alert: () => null,
}))
vi.mock('react-router', () => ({
  useNavigate: () => effects.navigate,
  useLocation: () => ({ state: null }),
  useSearchParams: () => [new URLSearchParams('next=%2Fworkspaces')],
  Link: ({ children }: { children: ReactNode }) => children,
}))

import LoginPage from '../../src/pages/login'
import { cookie } from '../../src/utils/storage/cookie'
import { resetUnauthorizedHandled, unAuthorizedResponseFunc } from '../../src/utils/request/utils'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.clearAllMocks()
  // 避免 happy-dom 在同一毫秒内仍返回 Max-Age=0 的空值 Cookie。
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now++)
  effects.send.mockReset()
  effects.navigate.mockReset()
  resetUnauthorizedHandled()
  cookie.set('token', 'session-one')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  flushSync(() => root.render(<LoginPage />))
})

afterEach(() => {
  flushSync(() => root.unmount())
  host.remove()
  cookie.remove('token')
})

/** 模拟进入登录页之前已发生一轮 401，建立真实去重状态。 */
async function expireSession() {
  unAuthorizedResponseFunc()
  await vi.waitFor(() => expect(effects.expiredNavigate).toHaveBeenCalledOnce())
  expect(effects.errorMessage).toHaveBeenCalledOnce()
}

describe('登录结果与 401 去重生命周期', () => {
  it('重新登录成功先保存令牌再导航，新会话后续 401 可以再次清理并提示', async () => {
    await expireSession()
    effects.send.mockResolvedValue({
      accessToken: 'session-two',
      absoluteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    effects.navigate.mockImplementation(() => {
      expect(cookie.get('token')).toBe('session-two')
    })

    await expect(
      effects.submit!({ account: ' Test_User ', password: 'test-password' }),
    ).resolves.toBe(true)

    expect(effects.send).toHaveBeenCalledExactlyOnceWith({
      account: 'test_user',
      password: 'test-password',
    })
    expect(effects.navigate).toHaveBeenCalledExactlyOnceWith('/workspaces', { replace: true })
    unAuthorizedResponseFunc()
    unAuthorizedResponseFunc()
    expect(cookie.get('token')).toBeNull()
    expect(effects.errorMessage).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(effects.expiredNavigate).toHaveBeenCalledTimes(2))
  })

  it('重新登录失败不重置当前 401 去重状态，也不保存令牌或执行成功导航', async () => {
    await expireSession()
    effects.send.mockRejectedValue(new Error('账号或密码错误'))

    await expect(
      effects.submit!({ account: 'test_user', password: 'wrong-password' }),
    ).resolves.toBe(false)

    unAuthorizedResponseFunc()
    await Promise.resolve()
    expect(cookie.get('token')).toBeNull()
    expect(effects.navigate).not.toHaveBeenCalled()
    expect(effects.errorMessage).toHaveBeenCalledOnce()
    expect(effects.expiredNavigate).toHaveBeenCalledOnce()
  })
})
