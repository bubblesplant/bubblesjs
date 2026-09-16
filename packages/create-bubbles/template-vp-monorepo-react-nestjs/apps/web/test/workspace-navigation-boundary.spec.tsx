// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const antdMocks = vi.hoisted(() => ({ destroyAll: vi.fn() }))
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>()
  return { ...actual, Modal: { ...actual.Modal, destroyAll: antdMocks.destroyAll } }
})

import { ConfigProvider } from 'antd'
import WorkspaceNavigationBoundary from '../src/layouts/WorkspaceLayout/components/WorkspaceNavigationBoundary'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

/** 读取内层 ConfigProvider 的宿主并模拟 Ant Design 页面级 portal。 */
function PortalDialog({ onSave }: { onSave: () => void }) {
  const { getPopupContainer } = useContext(ConfigProvider.ConfigContext)
  return createPortal(
    <button type="button" data-testid="portal-save" onClick={onSave}>
      保存企业 A
    </button>,
    getPopupContainer?.() ?? document.body,
  )
}

/** 模拟带未保存本地状态及打开弹窗的工作空间页面。 */
function WorkspacePage({ onSave, onUnmount }: { onSave: () => void; onUnmount: () => void }) {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => onUnmount, [onUnmount])

  return (
    <section data-testid="workspace-page">
      <span data-testid="draft-count">{count}</span>
      <button
        type="button"
        data-testid="change-draft"
        onClick={() => setCount((value) => value + 1)}
      >
        修改草稿
      </button>
      <button type="button" data-testid="open-portal" onClick={() => setOpen(true)}>
        编辑企业 A
      </button>
      {open && <PortalDialog onSave={onSave} />}
    </section>
  )
}

interface RenderBoundaryOptions {
  navigating?: boolean
  refreshing?: boolean
  onSave: () => void
  onUnmount: () => void
}

/** 同步提交导航或重校验状态，便于断言页面状态和 portal 宿主。 */
function renderBoundary({
  navigating = false,
  refreshing = false,
  onSave,
  onUnmount,
}: RenderBoundaryOptions) {
  flushSync(() => {
    root.render(
      <WorkspaceNavigationBoundary
        navigating={navigating}
        refreshing={refreshing}
        fallback={<div data-testid="workspace-loading">加载中</div>}
      >
        <WorkspacePage onSave={onSave} onUnmount={onUnmount} />
      </WorkspaceNavigationBoundary>,
    )
  })
}

/** 点击指定测试元素并同步提交由事件触发的状态更新。 */
function click(testId: string) {
  flushSync(() => {
    ;(document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click()
  })
}

beforeEach(() => {
  document.body.replaceChildren()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  antdMocks.destroyAll.mockClear()
})

afterEach(() => {
  flushSync(() => root.unmount())
  document.body.replaceChildren()
})

describe('工作空间等待交互边界', () => {
  it('权限重校验保留页面和弹窗状态，同时隐藏并禁用页面与 portal 宿主', () => {
    const save = vi.fn()
    const unmount = vi.fn()
    renderBoundary({ onSave: save, onUnmount: unmount })
    click('change-draft')
    click('open-portal')

    const portalButton = document.querySelector('[data-testid="portal-save"]')
    const portalHost = portalButton?.closest('.workspace-portal-host') as HTMLDivElement
    expect(portalButton).not.toBeNull()
    expect(portalHost).not.toBeNull()

    renderBoundary({ refreshing: true, onSave: save, onUnmount: unmount })

    const pageSurface = document.querySelector('.workspace-page-surface') as HTMLDivElement
    expect(document.querySelector('[data-testid="workspace-page"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="draft-count"]')?.textContent).toBe('1')
    expect(document.querySelector('[data-testid="portal-save"]')).toBe(portalButton)
    expect(pageSurface.hidden).toBe(true)
    expect(pageSurface.hasAttribute('inert')).toBe(true)
    expect(portalHost.hidden).toBe(true)
    expect(portalHost.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('[data-testid="workspace-loading"]')).not.toBeNull()
    expect(unmount).not.toHaveBeenCalled()
    expect(antdMocks.destroyAll).toHaveBeenCalledOnce()

    renderBoundary({ onSave: save, onUnmount: unmount })
    expect(document.querySelector('[data-testid="draft-count"]')?.textContent).toBe('1')
    expect(document.querySelector('[data-testid="portal-save"]')).toBe(portalButton)
    expect(portalHost.hidden).toBe(false)
    expect(unmount).not.toHaveBeenCalled()
  })

  it('跨路由导航仍卸载旧页面及其 portal，并在返回后创建全新页面状态', () => {
    const save = vi.fn()
    const unmount = vi.fn()
    renderBoundary({ onSave: save, onUnmount: unmount })
    click('change-draft')
    click('open-portal')
    const oldPortalButton = document.querySelector(
      '[data-testid="portal-save"]',
    ) as HTMLButtonElement

    renderBoundary({ navigating: true, onSave: save, onUnmount: unmount })

    const portalHost = document.querySelector('.workspace-portal-host') as HTMLDivElement
    expect(document.querySelector('[data-testid="workspace-page"]')).toBeNull()
    expect(document.querySelector('[data-testid="portal-save"]')).toBeNull()
    expect(document.querySelector('[data-testid="workspace-loading"]')).not.toBeNull()
    expect(portalHost.hidden).toBe(true)
    expect(portalHost.hasAttribute('inert')).toBe(true)
    expect(unmount).toHaveBeenCalledOnce()
    expect(antdMocks.destroyAll).toHaveBeenCalledOnce()

    oldPortalButton.click()
    expect(save).not.toHaveBeenCalled()

    renderBoundary({ onSave: save, onUnmount: unmount })
    expect(document.querySelector('[data-testid="draft-count"]')?.textContent).toBe('0')
    expect(document.querySelector('[data-testid="portal-save"]')).toBeNull()
  })
})
