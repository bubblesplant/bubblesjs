// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { ProForm } from '@ant-design/pro-components'
import { App } from 'antd'
import type {
  DictionaryOption,
  DictionaryOptionsRequest,
  DictionaryReference,
  WorkspacesResult,
} from 'shared/types'
import { createDictionaryStore } from '../../src/store/dictionary/core'
import { DICTIONARY_TTL } from '../../src/store/dictionary/model'

const runtime = vi.hoisted(() => ({
  store: undefined as ReturnType<typeof createDictionaryStore> | undefined,
}))
vi.mock('../../src/store/dictionary', async () => {
  const { useStore } = await import('zustand')
  return {
    useDictionaryStore: (
      selector: (
        state: ReturnType<ReturnType<typeof createDictionaryStore>['getState']>,
      ) => unknown,
    ) => useStore(runtime.store!, selector),
    requestDictionaryOptions: (input: DictionaryOptionsRequest) =>
      runtime.store!.getState().ensureDictionary(input),
  }
})
import DictionarySelect from '../../src/components/DictionarySelect/DictionarySelect'

let reference: DictionaryReference
let scenario = 0
const identity: WorkspacesResult = {
  user: { id: 'dict-qa', name: '测试用户', account: 'dict_qa' },
  workspaces: [],
}
let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let now: number
let fetch: ReturnType<
  typeof vi.fn<
    (input: DictionaryReference & { signal: AbortSignal }) => Promise<DictionaryOption[]>
  >
>

beforeEach(() => {
  // SWR 为模块级缓存，独立字典编码避免不同用例共享它的已完成结果。
  reference = { scope: { type: 'platform' }, code: `units_${++scenario}` }
  now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  fetch = vi.fn().mockResolvedValue([
    { label: '米', value: 'm' },
    { label: '厘米', value: 'cm' },
  ])
  runtime.store = createDictionaryStore({
    session: () => 'test-session',
    identity: async () => identity,
    fetch,
    read: () => undefined,
    save: () => {},
    remove: () => {},
  })
  runtime.store.getState().syncSession()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  flushSync(() => root.unmount())
  runtime.store!.getState().invalidate()
  document.body.replaceChildren()
})

/** 挂载真实 ProFormSelect，两个字段共享同一缓存和在途请求。 */
function render(input = reference, duplicate = false) {
  flushSync(() =>
    root.render(
      <App>
        <ProForm submitter={false}>
          <DictionarySelect {...input} name="unit" label="计量单位" />
          {duplicate && <DictionarySelect {...input} name="otherUnit" label="其他单位" />}
        </ProForm>
      </App>,
    ),
  )
}
/** 从真实下拉触发打开或关闭，验证 SWR 参数变化会经过统一 store。 */
function toggle() {
  const input = host.querySelector<HTMLInputElement>('[role="combobox"]')!
  flushSync(() => input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
}
/** 等待真实下拉渲染出指定选项文本。 */
async function expectOption(label: string) {
  await vi.waitFor(() =>
    expect(document.body.querySelector('.ant-select-dropdown')?.textContent).toContain(label),
  )
}

describe('DictionarySelect 真实 ProFormSelect 接入', () => {
  it('两个字段只取一次，打开下拉继续复用缓存', async () => {
    render(reference, true)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    toggle()
    await expectOption('厘米')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('TTL 到期后重新打开能取到新选项', async () => {
    render()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    toggle()
    await expectOption('厘米')
    toggle()
    fetch.mockResolvedValue([{ label: '千米', value: 'km' }])
    now += DICTIONARY_TTL
    toggle()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    await expectOption('千米')
  })
  it('保存后单键失效让已挂载字段重取', async () => {
    render()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    fetch.mockResolvedValue([{ label: '毫米', value: 'mm' }])
    flushSync(() => runtime.store!.getState().invalidate(reference))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    toggle()
    await expectOption('毫米')
  })
  it('加载失败显示错误，再次打开允许重试', async () => {
    fetch.mockRejectedValue(new Error('测试加载失败'))
    render()
    await vi.waitFor(() => expect(host.textContent).toContain('测试加载失败'))
    expect(runtime.store!.getState().entries).toEqual({})
    fetch.mockResolvedValue([{ label: '厘米', value: 'cm' }])
    toggle()
    await expectOption('厘米')
    await vi.waitFor(() => expect(host.textContent).not.toContain('测试加载失败'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('搜索过滤完整缓存，不为关键词重复发送 HTTP', async () => {
    render()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    toggle()
    await expectOption('厘米')
    const input = host.querySelector<HTMLInputElement>('[role="combobox"]')!
    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
    flushSync(() => {
      valueDescriptor.set!.call(input, '厘米')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await vi.waitFor(() => {
      const labels = [
        ...document.body.querySelectorAll('.ant-select-dropdown .ant-select-item-option-content'),
      ].map((element) => element.textContent)
      expect(labels).toEqual(['厘米'])
    })
    expect(fetch).toHaveBeenCalledOnce()
    expect(await runtime.store!.getState().ensureDictionary(reference)).toHaveLength(2)
  })
  it('切换字典不展示上一字典的选项，空结果有效缓存', async () => {
    render()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    fetch.mockResolvedValue([])
    render({ scope: { type: 'platform' }, code: 'empty' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    toggle()
    await vi.waitFor(() =>
      expect(document.body.querySelector('.ant-select-dropdown')?.textContent).not.toContain(
        '厘米',
      ),
    )
    toggle()
    toggle()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })
})
