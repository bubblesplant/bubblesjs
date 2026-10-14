// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { MemberOnboardingActionsProps } from '../../src/pages/access/components/MemberOnboarding/MemberOnboardingActions'

vi.mock('@bubblesjs/i18n-react', () => ({ useI18n: () => ({ tr: (key: string) => key }) }))
vi.mock('../../src/pages/access/components/EntitySelectors/selector-requests', () => ({
  createOrganizationMemberSearch: vi.fn(),
  createOrganizationMemberResolver: vi.fn(),
}))
vi.mock('../../src/pages/access/components/MemberOnboarding/AddProjectMemberDialog', () => ({
  /** 模拟项目弹窗的引用接口，验证项目入口可打开它。 */
  default: function ProjectDialog({ ref }: { ref: Ref<{ show: () => void; hide: () => void }> }) {
    const [open, setOpen] = useState(false)
    useImperativeHandle(ref, () => ({ show: () => setOpen(true), hide: () => setOpen(false) }))
    return open ? <div role="dialog">添加项目成员</div> : null
  },
}))
vi.mock(
  '../../src/pages/access/components/MemberOnboarding/RegisterCompanyMember/RegisterCompanyMemberDialog',
  () => ({
    /** 模拟注册弹窗的引用接口，验证已确认的企业入口可打开它。 */
    default: function RegisterDialog({
      ref,
    }: {
      ref: Ref<{ show: () => void; hide: () => void }>
    }) {
      const [open, setOpen] = useState(false)
      useImperativeHandle(ref, () => ({ show: () => setOpen(true), hide: () => setOpen(false) }))
      return open ? <div role="dialog">直接注册企业成员</div> : null
    },
  }),
)

import MemberOnboardingActions from '../../src/pages/access/components/MemberOnboarding/MemberOnboardingActions'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
const onRegister = vi.fn()
const onAdd = vi.fn()

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  flushSync(() => root.unmount())
  document.body.replaceChildren()
  vi.clearAllMocks()
})

/** 渲染实际成员入口，使用子弹窗夹具避免请求后端。 */
function renderActions(scope: MemberOnboardingActionsProps['scope']) {
  flushSync(() =>
    root.render(
      <MemberOnboardingActions
        scope={scope}
        memberContextKey="test"
        api={{} as MemberOnboardingActionsProps['api']}
        onRegisterCompanyMember={onRegister}
        onAddProjectMember={onAdd}
      />,
    ),
  )
}

describe('当前成员接入边界', () => {
  it('企业邀请入口禁用，点击不打开弹窗或提交；直接注册仍可打开', () => {
    renderActions({ type: 'company', companyId: 'company-a' })
    const buttons = [...host.querySelectorAll('button')]
    const invite = buttons.find((button) => button.textContent?.includes('邀请成员（待确认）'))!
    expect(invite.disabled).toBe(true)
    flushSync(() => invite.click())
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(onRegister).not.toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
    const register = buttons.find((button) => button.textContent?.includes('直接注册'))!
    flushSync(() => register.click())
    expect(host.querySelector('[role="dialog"]')?.textContent).toBe('直接注册企业成员')
  })
  it('项目只提供添加已有企业成员入口', () => {
    renderActions({ type: 'project', companyId: 'company-a', projectId: 'project-a' })
    expect(host.textContent).not.toContain('邀请')
    expect(host.textContent).not.toContain('直接注册')
    flushSync(() => host.querySelector('button')?.click())
    expect(host.querySelector('[role="dialog"]')?.textContent).toBe('添加项目成员')
  })
})
