// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    /** 暴露组件传给原生过渡边界的更新策略，DOM 环境不模拟动画像素。 */
    ViewTransition({
      name,
      update,
      children,
    }: PropsWithChildren<{ name: string; update: string }>) {
      return (
        <div data-transition={name} data-update={update}>
          {children}
        </div>
      )
    },
  }
})

import RouteTransition from '../../src/components/RouteTransition/RouteTransition'

const testRoutes: RouteObject[] = [
  {
    id: 'root',
    element: <RouteTransition region="layout" />,
    loader: () => null,
    HydrateFallback: () => null,
    children: [
      { path: '/login', element: '登录' },
      {
        id: 'authenticated',
        children: [
          { path: '/workspaces', element: '工作空间' },
          {
            path: '/companies/:companyId',
            element: <RouteTransition />,
            children: [
              { index: true, element: '企业首页' },
              { path: 'members', element: '企业成员' },
            ],
          },
          {
            path: '/companies/:companyId/projects/:projectId',
            element: <RouteTransition />,
            children: [
              { index: true, element: '项目首页' },
              { path: 'members', element: '项目成员' },
            ],
          },
        ],
      },
      { path: '*', element: '未找到' },
    ],
  },
]

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let router: ReturnType<typeof createMemoryRouter> | undefined

/** 挂载实际路由过渡组件，保留根边界与无路径父层的真实匹配结果。 */
async function mountRouter(path: string) {
  router = createMemoryRouter(testRoutes, { initialEntries: [path] })
  flushSync(() => root.render(<RouterProvider router={router!} />))
  await vi.waitFor(() => {
    expect(host.querySelector('[data-transition="route-layout"]')).not.toBeNull()
  })
  return router
}

/** 读取布局或内容区传给 ViewTransition 的更新策略。 */
function transitionUpdate(region = 'layout') {
  return host.querySelector(`[data-transition="route-${region}"]`)?.getAttribute('data-update')
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  flushSync(() => root.unmount())
  router?.dispose()
  router = undefined
  host.remove()
})

describe('无路径认证父层下的路由转场', () => {
  it('同企业菜单仅更新内容区，重新校验不触发整布局动画', async () => {
    const current = await mountRouter('/companies/company-a')
    await current.navigate('/companies/company-a/members')
    await vi.waitFor(() => expect(host.textContent).toBe('企业成员'))
    expect(transitionUpdate()).toBe('none')
    expect(transitionUpdate('page')).toBe('route-page')

    await current.revalidate()
    await vi.waitFor(() => expect(current.state.revalidation).toBe('idle'))
    expect(transitionUpdate()).toBe('none')
  })

  it.each([
    ['/companies/company-a', '/companies/company-b', '企业首页'],
    ['/companies/company-a', '/companies/company-a/projects/project-a', '项目首页'],
    [
      '/companies/company-a/projects/project-a',
      '/companies/company-a/projects/project-b',
      '项目首页',
    ],
    ['/workspaces', '/companies/company-a', '企业首页'],
    ['/login', '/workspaces', '工作空间'],
    ['/companies/company-a', '/unknown-path', '未找到'],
  ])('%s → %s 仍触发整布局动画', async (from, to, content) => {
    const current = await mountRouter(from)
    await current.navigate(to)
    await vi.waitFor(() => {
      expect(host.textContent).toBe(content)
      expect(transitionUpdate()).toBe('route-layout')
    })
  })
})
