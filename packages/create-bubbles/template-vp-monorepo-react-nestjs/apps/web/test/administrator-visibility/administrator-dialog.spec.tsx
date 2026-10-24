// @vitest-environment happy-dom

import { ConfigProvider } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type {
  AdministratorSummary,
  CompanyRecord,
  GlobalAccountCandidate,
  SetAdministratorRequest,
} from 'shared/types'
import AdministratorDialog, {
  type AdministratorDialogRef,
} from '../../src/pages/access/components/AdministratorDialog'
import AdministratorList from '../../src/pages/access/components/AdministratorDialog/AdministratorList'

vi.mock('@bubblesjs/i18n-react', () => ({
  useI18n: () => ({
    tr: (key: string, params: Record<string, string> = {}) =>
      key.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`),
  }),
}))

const administrators: AdministratorSummary[] = [
  {
    id: 'admin-one',
    name: '林管理员',
    account: 'lin.one',
    accountStatus: 'active',
    memberStatus: 'active',
    effective: true,
  },
  {
    id: 'admin-two',
    name: '林管理员',
    account: 'lin.two',
    accountStatus: 'disabled',
    memberStatus: 'active',
    effective: false,
  },
]
const company: CompanyRecord = {
  id: 'company-a',
  name: '甲企业',
  code: 'company-a',
  description: '',
  status: 'active',
  version: 1,
  createdAt: '2026-10-23T00:00:00.000Z',
  updatedAt: '2026-10-23T00:00:00.000Z',
}
const newAdministrator: GlobalAccountCandidate = {
  userId: 'admin-new',
  name: '新管理员',
  account: 'new.admin',
  status: 'active',
  disabled: false,
  disabledReason: null,
}
const onSave = vi.fn<(record: CompanyRecord, input: SetAdministratorRequest) => Promise<boolean>>()
let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let dialogRef: ReturnType<typeof createRef<AdministratorDialogRef>>

beforeEach(() => {
  onSave.mockReset().mockResolvedValue(true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  dialogRef = createRef<AdministratorDialogRef>()
})

afterEach(() => {
  flushSync(() => root.unmount())
  document.body.replaceChildren()
})

/** 挂载真实弹窗及选择器，只将远程候选查询替换为固定候选。 */
function renderDialog() {
  flushSync(() =>
    root.render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <AdministratorDialog
          ref={dialogRef}
          project={false}
          memberContextKey="platform"
          globalAccountRequest={async () => ({ items: [newAdministrator] })}
          resolveGlobalAccounts={async () => []}
          memberRequest={async () => ({ items: [], total: 0 })}
          resolveMembers={async () => []}
          onSave={onSave}
        />
      </ConfigProvider>,
    ),
  )
}

/** 通过组件公开接口打开实体，并等待门户内容进入 DOM。 */
async function showDialog(record = company, admins = administrators) {
  flushSync(() => dialogRef.current?.show(record, admins))
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
}

/** 获取被替换管理员的真实 AntD Select，避免误操作新管理员选择器。 */
function replacementSelect() {
  const select = document.querySelector('#replaceUserId')?.closest<HTMLDivElement>('.ant-select')
  if (!select) throw new Error('未渲染被替换管理员选择器')
  return select
}

/** 打开实际下拉选项并按完整账号选择，覆盖同名账号的识别。 */
async function selectReplacement(account: string) {
  const selector = replacementSelect().querySelector('.ant-select-content')!
  flushSync(() => selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
  await vi.waitFor(() => {
    expect(document.querySelectorAll('.ant-select-item-option-content').length).toBeGreaterThan(0)
  })
  const option = [
    ...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content'),
  ].find((item) => item.textContent?.includes(account))
  if (!option) throw new Error(`未找到管理员账号：${account}`)
  flushSync(() => option.click())
}

/** 通过输入事件触发真实远程搜索，再选择返回的稳定用户身份。 */
async function selectNewAdministrator() {
  const input = document.querySelector<HTMLInputElement>('#administratorUserId')!
  flushSync(() => {
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'new')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await vi.waitFor(() => {
    const option = [
      ...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content'),
    ].find((item) => item.textContent?.includes('new.admin'))
    expect(option).toBeDefined()
    flushSync(() => option!.click())
  })
}

/** 点击实际提交按钮，让真实 Form 校验后调用保存接口。 */
function submitAdministrator() {
  const submit = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (button) => button.textContent === '保存管理员',
  )
  if (!submit) throw new Error('未找到保存管理员按钮')
  flushSync(() => submit.click())
}

describe('企业管理员身份展示', () => {
  it('名单显示所有管理员的完整身份和有效状态，空名单有明确提示', () => {
    flushSync(() => root.render(<AdministratorList administrators={administrators} />))
    expect(host.textContent).toContain('林管理员 (lin.one)')
    expect(host.textContent).toContain('林管理员 (lin.two)')
    expect([...host.querySelectorAll('.ant-tag')].map((tag) => tag.textContent)).toEqual([
      '有效',
      '当前无效',
    ])

    flushSync(() => root.render(<AdministratorList administrators={[]} />))
    expect(host.textContent).toBe('暂无管理员')
  })

  it('打开设置后立即展示现任名单，选择和清空替换对象会同步撤销提示', async () => {
    renderDialog()
    await showDialog()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('当前管理员')
    expect(dialog.textContent).toContain('林管理员 (lin.one)')
    expect(dialog.textContent).toContain('林管理员 (lin.two)')
    expect(dialog.textContent).toContain('当前无效')
    expect(dialog.textContent).toContain('未选择被替换者，将保留全部现有管理员。')

    await selectReplacement('lin.two')
    await vi.waitFor(() =>
      expect(dialog.textContent).toContain('将撤销 林管理员（lin.two）的管理员身份'),
    )
    expect(dialog.textContent).not.toContain('未选择被替换者，将保留全部现有管理员。')

    const clear = replacementSelect().querySelector<HTMLElement>('.ant-select-clear')!
    flushSync(() => clear.click())
    await vi.waitFor(() =>
      expect(dialog.textContent).toContain('未选择被替换者，将保留全部现有管理员。'),
    )
    expect(dialog.textContent).not.toContain('将撤销 林管理员（lin.two）的管理员身份')
  })

  it('同一弹窗切换到其他企业时清除上个企业的替换选择', async () => {
    renderDialog()
    await showDialog()
    await selectReplacement('lin.one')
    await vi.waitFor(() => expect(replacementSelect().textContent).toContain('林管理员 (lin.one)'))

    await showDialog({ ...company, id: 'company-b', name: '乙企业' }, [])
    await vi.waitFor(() => {
      const dialog = document.querySelector('[role="dialog"]')!
      expect(dialog.textContent).toContain('设置企业管理员 · 乙企业')
      expect(dialog.textContent).toContain('暂无管理员')
      expect(replacementSelect().textContent).not.toContain('lin.one')
      expect(dialog.textContent).toContain('未选择被替换者，将保留全部现有管理员。')
    })
  })

  it('关闭后再次打开其他企业，不保留上次替换对象', async () => {
    renderDialog()
    await showDialog()
    await selectReplacement('lin.two')
    flushSync(() => dialogRef.current?.hide())
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())

    await showDialog({ ...company, id: 'company-b', name: '乙企业' }, [])
    expect(replacementSelect().textContent).not.toContain('lin.two')
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
      '未选择被替换者，将保留全部现有管理员。',
    )
  })

  it.each([
    { mode: '补充', replacement: undefined },
    { mode: '替换', replacement: 'lin.two' },
  ])('以 $mode 方式保存时提交稳定用户身份及准确的替换对象', async ({ replacement }) => {
    renderDialog()
    await showDialog()
    await selectNewAdministrator()
    if (replacement) await selectReplacement(replacement)
    submitAdministrator()
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(company, {
        administratorUserId: 'admin-new',
        ...(replacement ? { replaceUserId: 'admin-two' } : {}),
      })
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    })
  })

  it('保存未成功时保留弹窗和替换对象，便于检查后重试', async () => {
    onSave.mockResolvedValue(false)
    renderDialog()
    await showDialog()
    await selectNewAdministrator()
    await selectReplacement('lin.two')
    submitAdministrator()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
      '将撤销 林管理员（lin.two）的管理员身份',
    )
    expect(replacementSelect().textContent).toContain('lin.two')
  })
})
