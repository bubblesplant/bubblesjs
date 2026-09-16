import { vi } from 'vite-plus/test'
import type { AccessContext, AccessScope, WorkspaceEntry, WorkspacesResult } from 'shared/types'
import { accessScopeKey } from 'shared/utils'

const api = vi.hoisted(() => ({
  getAccessContext:
    vi.fn<
      (
        scope: AccessScope,
        options: { workspaceKey: string; signal?: AbortSignal },
      ) => Promise<AccessContext>
    >(),
  getWorkspaces:
    vi.fn<(options: { workspaceKey: string; signal?: AbortSignal }) => Promise<WorkspacesResult>>(),
}))
const session = vi.hoisted(() => ({ token: 'session' as string | null }))
export { api, session }
vi.mock('@/pages/workspaces/api', () => api)
vi.mock('@/utils/request/workspace', () => ({ enterWorkspace: vi.fn() }))
vi.mock('@/utils/storage/cookie', () => ({ cookie: { get: () => session.token } }))

import { authMiddleware } from '../../src/router/middleware/auth'
import { accessMiddleware } from '../../src/router/middleware/workspace/access'
import { scopeMiddleware, workspacesMiddleware } from '../../src/router/middleware/workspace/data'
import { entryMiddleware } from '../../src/router/middleware/workspace/entry'
import { getWorkspaceState } from '../../src/pages/workspaces/state'
import type { RegisteredPage } from '../../src/router/page-registry'

export const companyScope = { type: 'company', companyId: 'company-a' } as const
export const projectScope = {
  type: 'project',
  companyId: 'company-a',
  projectId: 'project-a',
} as const
export const projectPath = '/companies/company-a/projects/project-a'
const user = { id: 'user', name: '测试成员', account: 'member' }

/** 构造完整权限响应，允许各策略用例只覆盖相关业务字段。 */
export function access(scope: AccessScope, overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    user,
    scope,
    administrator: null,
    permissionKeys: [`${scope.type}.home.read`],
    menus: [],
    menuVersion: 1,
    catalogVersion: 'v1',
    ...overrides,
  }
}

/** 构造列表入口，管理员字段与权限响应可分别模拟。 */
export function workspace(
  scope: AccessScope,
  administrator: WorkspaceEntry['administrator'] = null,
): WorkspaceEntry {
  return { scope, name: `${scope.type} 工作空间`, administrator }
}

/** 重置会话及接口，默认允许所有测试作用域的首页。 */
export function resetPolicyData() {
  vi.clearAllMocks()
  session.token = 'session'
  const state = getWorkspaceState()
  state.workspaces = undefined
  state.accessByScope.clear()
  api.getAccessContext.mockReset().mockImplementation(async (scope) => access(scope))
  setWorkspaces([])
}

/** 为后续列表请求提供可明确控制的空间集合。 */
export function setWorkspaces(workspaces: WorkspaceEntry[]) {
  api.getWorkspaces.mockReset().mockResolvedValue({ user, workspaces })
}

/** 按作用域返回指定权限，未指定的作用域仍有默认首页权限。 */
export function setAccess(contexts: AccessContext[]) {
  const byScope = new Map(contexts.map((context) => [accessScopeKey(context.scope), context]))
  api.getAccessContext.mockImplementation(
    async (scope) => byScope.get(accessScopeKey(scope)) ?? access(scope),
  )
}

/** 用真实 middleware 构建最小页面树，保留生产路由的父子错误边界。 */
function scopeRoute(type: AccessScope['type'], path: string): RouteObject {
  const pages = type === 'platform' ? ['home', 'accounts', 'menus'] : ['home', 'members', 'roles']
  return {
    id: type,
    path,
    middleware: [authMiddleware, scopeMiddleware(type)],
    errorElement: '作用域不可用',
    children: pages.map((name): RouteObject => ({
      id: `${type}.${name}`,
      ...(name === 'home' ? { index: true as const } : { path: name }),
      middleware: [accessMiddleware(`${type}.${name}` as RegisteredPage)],
      element: null,
      errorElement: '页面不可用',
    })),
  }
}

/** 建立内存路由并提供业务数据读取入口，测试结束必须调用 dispose。 */
export async function makeRouter() {
  const router = createMemoryRouter(
    [
      {
        id: 'root',
        errorElement: '路由不可用',
        children: [
          { path: '/placeholder', element: null },
          { path: '/login', element: null },
          ...['/', '/home'].map((path) => ({
            path,
            middleware: [authMiddleware, workspacesMiddleware, entryMiddleware],
          })),
          {
            path: '/workspaces',
            middleware: [authMiddleware, workspacesMiddleware],
            element: null,
          },
          scopeRoute('platform', '/platform'),
          scopeRoute('company', '/companies/:companyId'),
          scopeRoute('project', '/companies/:companyId/projects/:projectId'),
        ],
      },
    ],
    { initialEntries: ['/placeholder'] },
  )
  await vi.waitFor(() => {
    if (!router.state.initialized) throw new Error('等待初始导航完成')
  })
  return {
    router,
    access: (scope: AccessScope) => getWorkspaceState().accessByScope.get(accessScopeKey(scope)),
    workspaces: () => getWorkspaceState().workspaces,
    dispose() {
      router.dispose()
    },
  }
}
