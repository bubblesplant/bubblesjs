// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

vi.mock('../../src/store/user', () => ({
  useUserStore: () => ({
    invalidateWorkspaces: vi.fn(),
    workspaces: {
      user: {
        id: 'user-without-workspace',
        name: '无空间用户',
        account: 'no-workspace@example.test',
      },
      workspaces: [],
    },
  }),
}))
vi.mock('../../src/api/auth', () => ({ logout: vi.fn() }))
vi.mock('../../src/utils/request/workspace', () => ({ clearWorkspaceRequests: vi.fn() }))
vi.mock('../../src/components/Brand/Brand', () => ({ default: () => <span>万物</span> }))
vi.mock('../../src/components/LocaleSwitch/LocaleSwitch', () => ({ default: () => null }))
vi.mock('@bubblesjs/i18n-react', () => ({
  useI18n: () => ({ tr: (key: string) => key }),
}))
vi.mock('../../src/components/PasswordActions/ChangePasswordDialog', () => ({
  /** 模拟改密弹窗的引用接口，以验证页面入口能实际打开它。 */
  default: function PasswordDialog({ ref }: { ref: Ref<{ show: () => void; hide: () => void }> }) {
    const [open, setOpen] = useState(false)
    useImperativeHandle(ref, () => ({ show: () => setOpen(true), hide: () => setOpen(false) }))
    return open ? <div role="dialog">修改密码表单</div> : null
  },
}))

import { App } from 'antd'
import WorkspacesPage from '../../src/pages/workspaces'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  document.body.replaceChildren()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  flushSync(() => root.unmount())
  document.body.replaceChildren()
})

describe('无工作空间账号的本人改密入口', () => {
  it('显示空工作空间提示时仍可从账户菜单打开改密表单', async () => {
    const router = createMemoryRouter([{ path: '/workspaces', element: <WorkspacesPage /> }], {
      initialEntries: ['/workspaces'],
    })
    flushSync(() =>
      root.render(
        <App>
          <RouterProvider router={router} />
        </App>,
      ),
    )

    await vi.waitFor(() => {
      expect(host.textContent).toContain('暂未加入企业')
    })
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="账户菜单"]')
    expect(trigger).not.toBeNull()
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')

    flushSync(() => trigger?.click())
    await vi.waitFor(() => {
      expect(trigger?.getAttribute('aria-expanded')).toBe('true')
      const identity = document.body.querySelector('.workspace-account-identity')
      expect(identity?.textContent).toContain('无空间用户')
      expect(identity?.textContent).toContain('no-workspace@example.test')
    })

    const passwordItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (element) => element.textContent?.includes('修改密码'),
    )
    expect(passwordItem).toBeDefined()

    flushSync(() => passwordItem?.click())
    await vi.waitFor(() => {
      expect(host.querySelector('[role="dialog"]')?.textContent).toBe('修改密码表单')
      expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    })
  })
})
