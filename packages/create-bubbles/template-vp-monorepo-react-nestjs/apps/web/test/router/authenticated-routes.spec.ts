import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  access,
  api,
  companyScope,
  resetPolicyData,
  session,
  setAccess,
  setWorkspaces,
  workspace,
} from './config'

vi.mock('@/layouts/WorkspaceLayout', () => ({ default: () => null }))
vi.mock('@/layouts/BasicLayout', () => ({ default: () => null }))
vi.mock('@/router/lazy-load', () => ({ lazyLoad: () => null }))

import { routes } from '../../src/router/modules'
import { useUserStore } from '../../src/store/user'

let router: ReturnType<typeof createMemoryRouter> | undefined

beforeEach(() => {
  resetPolicyData()
  session.token = null
  useUserStore.getState().syncSession()
})

afterEach(() => {
  router?.dispose()
  router = undefined
})

/** 等待生产路由完成初始导航，确保断言发生在认证及工作空间 middleware 执行之后。 */
async function enterRoute(path: string) {
  router = createMemoryRouter(routes, { initialEntries: [path] })
  await vi.waitFor(() => expect(router?.state.initialized).toBe(true))
  return router
}

/** 确认公开访问与未登录拦截均没有读取用户或工作空间数据。 */
function expectNoWorkspaceRequests() {
  expect(api.getWorkspaces).not.toHaveBeenCalled()
  expect(api.getAccessContext).not.toHaveBeenCalled()
  expect(api.getWorkspaceUser).not.toHaveBeenCalled()
}

describe('生产路由统一认证边界', () => {
  it.each([
    '/',
    '/home',
    '/workspaces',
    '/platform',
    '/companies/company-a',
    '/companies/company-a/projects/project-a',
  ])('未登录直接访问 %s 时先跳登录，不请求空间数据', async (path) => {
    const current = await enterRoute(path)
    expect(current.state.location.pathname).toBe('/login')
    expect(current.state.errors).toBeNull()
    expectNoWorkspaceRequests()
  })

  it.each([
    '/login',
    '/register',
    '/missing-route',
    '/examples/pro-table',
    '/examples/pro-table/draft',
    '/examples/i18n',
  ])('未登录直接访问公开地址 %s 不受认证拦截', async (path) => {
    const current = await enterRoute(path)
    expect(current.state.location.pathname).toBe(path)
    expect(current.state.errors).toBeNull()
    expectNoWorkspaceRequests()
  })

  it('有令牌时保留原作用域数据交接、页面 id 和权限错误归属', async () => {
    session.token = 'session'
    setWorkspaces([workspace(companyScope)])
    const current = await enterRoute('/companies/company-a')

    expect(current.state.matches.map((match) => match.route.id)).toEqual([
      'root',
      'authenticated',
      'company',
      'company.home',
    ])
    expect(current.state.errors).toBeNull()
    expect(api.getAccessContext).toHaveBeenCalledExactlyOnceWith(companyScope, {
      workspaceKey: 'company:company-a',
      signal: expect.any(AbortSignal),
    })
    expect(useUserStore.getState().accessByScope.get('company:company-a')).toMatchObject({
      scope: companyScope,
      permissionKeys: ['company.home.read'],
      workspace: { scope: companyScope },
    })

    setAccess([access(companyScope, { permissionKeys: [] })])
    await current.revalidate()
    expect(current.state.errors?.['company.home']).toMatchObject({ status: 403 })
    expect(useUserStore.getState().accessByScope.get('company:company-a')?.permissionKeys).toEqual(
      [],
    )
  })
})
