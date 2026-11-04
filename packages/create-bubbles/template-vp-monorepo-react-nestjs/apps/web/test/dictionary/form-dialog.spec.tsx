// @vitest-environment happy-dom

import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { CreateDictionaryRequest, DictionaryRecord } from 'shared/types'
import DictionaryFormDialog, {
  type DictionaryFormDialogRef,
} from '../../src/pages/dictionaries/components/DictionaryFormDialog'

vi.mock('@bubblesjs/i18n-react', () => ({
  useI18n: () => ({ tr: (key: string) => key }),
}))

const nation: DictionaryRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  scope: { type: 'platform' },
  code: 'nation',
  name: '民族',
  description: '字典编辑回归数据',
  status: 'active',
  items: [
    { value: 'han', label: '汉族', sort: 0, status: 'active' },
    { value: 'other', label: '其他', sort: 5, status: 'disabled' },
  ],
  version: 3,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
}
const units: DictionaryRecord = {
  ...nation,
  id: '00000000-0000-4000-8000-000000000002',
  code: 'units',
  name: '计量单位',
  items: [{ value: 'm', label: '米', sort: 2, status: 'active' }],
}
const onSave =
  vi.fn<(body: CreateDictionaryRequest, record?: DictionaryRecord) => Promise<boolean>>()
let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let dialogRef: ReturnType<typeof createRef<DictionaryFormDialogRef>>

beforeEach(() => {
  onSave.mockReset().mockResolvedValue(true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  dialogRef = createRef<DictionaryFormDialogRef>()
  flushSync(() =>
    root.render(
      <ConfigProvider locale={zhCN} theme={{ token: { motion: false } }}>
        <App>
          <DictionaryFormDialog ref={dialogRef} onSave={onSave} />
        </App>
      </ConfigProvider>,
    ),
  )
})

afterEach(() => {
  flushSync(() => root.unmount())
  document.body.replaceChildren()
})

/** 通过组件真实公开入口打开，覆盖首次懒挂载而非提前渲染表单。 */
async function show(record?: DictionaryRecord) {
  flushSync(() => dialogRef.current?.show(record))
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
}

/** 读取真实表单控件，确保选项确实渲染到界面而非仅存在于状态中。 */
function input(name: string) {
  return document.querySelector<HTMLInputElement>(
    `[role="dialog"] input[id="${name}"], [role="dialog"] input[id$="_${name}"]`,
  )
}

/** 点击实际按钮，让关闭和校验提交均经过 ModalForm 的正常流程。 */
function clickButton(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (item) => item.textContent?.replace(/\s/g, '') === text,
  )
  if (!button) throw new Error(`未找到按钮：${text}`)
  flushSync(() => button.click())
}

/** 等待弹窗销毁后再打开，覆盖用户取消和保存后的常规操作。 */
async function cancel() {
  clickButton('取消')
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
}

/** 等待已保存的全部项出现在选项列表，包括停用项及其只读业务值。 */
async function expectItems(record: DictionaryRecord) {
  await vi.waitFor(() => {
    expect(input('code')?.value).toBe(record.code)
    expect(input('name')?.value).toBe(record.name)
    expect(document.querySelectorAll('input[id$="_value"]')).toHaveLength(record.items.length)
    record.items.forEach((item, index) => {
      expect(input(`items_${index}_value`)?.value).toBe(item.value)
      expect(input(`items_${index}_value`)?.disabled).toBe(true)
      expect(input(`items_${index}_label`)?.value).toBe(item.label)
      expect(input(`items_${index}_sort`)?.value).toBe(String(item.sort))
    })
  })
}

describe('字典编辑真实 ModalForm／ProFormList 回填', () => {
  it('已有空字典可原样保存，也可正常新增选项输入行', async () => {
    const empty = { ...nation, items: [] }
    await show(empty)
    await vi.waitFor(() => expect(input('code')?.value).toBe(empty.code))
    expect(input('items_0_value')).toBeNull()
    clickButton('确定')
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave.mock.calls[0]?.[0].items).toEqual([])
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    await show(empty)
    clickButton('新增选项')
    await vi.waitFor(() => {
      expect(input('items_0_value')?.disabled).toBe(false)
      expect(input('items_0_label')?.value).toBe('')
      expect(input('items_0_sort')?.value).toBe('0')
    })
  })

  it('首次直接编辑完整回填启用及停用项，原样保存保留全部项与版本记录', async () => {
    await show(nation)
    await expectItems(nation)
    clickButton('确定')
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave.mock.calls[0]).toEqual([
      {
        code: nation.code,
        name: nation.name,
        description: nation.description,
        status: nation.status,
        items: nation.items,
      },
      nation,
    ])
  })

  it('取消新增的草稿项后重开同一记录，完整恢复已保存选项', async () => {
    await show(nation)
    await expectItems(nation)
    clickButton('新增选项')
    await vi.waitFor(() => expect(input('items_2_value')).not.toBeNull())
    await cancel()
    await show(nation)
    await expectItems(nation)
    expect(nation.items).toHaveLength(2)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('编辑不同字典时不沿用上一份选项', async () => {
    await show(nation)
    await expectItems(nation)
    await cancel()
    await show(units)
    await expectItems(units)
  })

  it('编辑与新增切换时清空旧字段和草稿，再次编辑恢复当前字典', async () => {
    await show(nation)
    await expectItems(nation)
    await cancel()
    await show()
    await vi.waitFor(() => {
      expect(input('code')?.value).toBe('')
      expect(input('code')?.disabled).toBe(false)
      expect(input('name')?.value).toBe('')
      expect(input('items_0_value')).toBeNull()
    })
    clickButton('新增选项')
    await vi.waitFor(() => expect(input('items_0_value')?.disabled).toBe(false))
    await cancel()
    await show(units)
    await expectItems(units)
  })
})
