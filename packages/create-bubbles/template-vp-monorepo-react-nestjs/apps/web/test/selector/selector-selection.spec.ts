import { describe, expect, expectTypeOf, it, vi } from 'vite-plus/test'
import type { BasicTableSelectorProps } from '../../src/components/Selector'
import { BasicTableSelectorSelection } from '../../src/components/Selector/BasicTableSelector/BasicTableSelectorSelection'

interface Row {
  id: string | number
  name: string
  quantity?: number
}

const alice: Row = { id: 'a', name: '甲' }
const bob: Row = { id: 'b', name: '乙' }
const carol: Row = { id: 'c', name: '丙' }

describe('BasicTableSelector 跨页选择与完整对象契约', () => {
  it('公开接口接受普通标题、表格配置和数组结果回调', () => {
    const props: BasicTableSelectorProps<Row> = {
      ref: null,
      title: '选择条目',
      rowKey: 'id',
      multiple: true,
      columns: [{ title: '名称', dataIndex: 'name' }],
      request: async () => ({ data: [alice], total: 1, success: true }),
      /** 合并行禁选规则，并在确认过程中禁用选择控件。 */
      getCheckboxProps: (row) => ({ disabled: row.id === 'disabled' }),
      onChange: (_keys, rows) => {
        expectTypeOf(rows).toEqualTypeOf<Row[]>()
      },
    }
    expect(props.title).toBe('选择条目')
  })

  it('跨页、搜索后保留此前选择，取消某一页的选择只移除对应项', () => {
    const empty = new BasicTableSelectorSelection<Row>({ rowKey: 'id', multiple: true })
    const firstPage = empty.select({ value: ['a'], rows: [alice] })
    const nextPage = firstPage.remember([bob, carol])
    const selected = nextPage.select({ value: ['a', 'b'], rows: [bob] })
    expect(selected.rows).toEqual([alice, bob])
    expect(selected.remember([carol]).rows).toEqual([alice, bob])
    expect(selected.select({ value: ['b'] }).rows).toEqual([bob])
    expect(firstPage.value).toEqual(['a'])
    expect(empty.value).toEqual([])
  })

  it('保留跨页初始 key，只补查缺失对象，按 key 顺序返回对象', async () => {
    const selection = new BasicTableSelectorSelection<Row>({
      rowKey: 'id',
      multiple: true,
      value: ['c', 'a', 'b'],
      selectedRows: [bob],
    }).remember([alice])
    const requestByKeys = vi.fn(async () => [carol, { id: 'extra', name: '多余结果' }])
    const resolved = await selection.resolve(requestByKeys)
    expect(requestByKeys).toHaveBeenCalledExactlyOnceWith(['c'])
    expect(resolved.rows).toEqual([carol, alice, bob])
    expect(resolved.get('extra')).toBeUndefined()
  })

  it('仅传 key 且对象未加载时拒绝不完整结果，补查漏项也不静默删除 key', async () => {
    const selection = new BasicTableSelectorSelection<Row>({
      rowKey: 'id',
      multiple: true,
      value: ['a'],
    })
    await expect(selection.resolve()).rejects.toThrow('尚未加载')
    await expect(selection.resolve(async () => [])).rejects.toThrow('已不可用')
    await expect(
      selection.resolve(async () => {
        throw new Error('网络错误')
      }),
    ).rejects.toThrow('网络错误')
    expect(selection.value).toEqual(['a'])
  })

  it('已有完整对象无需补查；单选替换与清空也统一返回数组', async () => {
    const selection = new BasicTableSelectorSelection<Row>({
      rowKey: 'id',
      multiple: false,
      value: ['a'],
      selectedRows: [alice],
    })
    const requestByKeys = vi.fn(async () => [])
    expect((await selection.resolve(requestByKeys)).rows).toEqual([alice])
    expect(requestByKeys).not.toHaveBeenCalled()
    const replacement = selection.select({ value: ['b'], rows: [bob] })
    expect(replacement.value).toEqual(['b'])
    expect(replacement.rows).toEqual([bob])
    const cleared = replacement.select({ value: [] })
    expect(cleared.value).toEqual([])
    expect(cleared.rows).toEqual([])
  })

  it('支持函数 rowKey、数值零和 key 去重，区分数值与字符串 key', () => {
    const rows: Row[] = [
      { id: 0, name: '零' },
      { id: '0', name: '字符串零' },
    ]
    const selection = new BasicTableSelectorSelection<Row>({
      rowKey: (row) => row.id,
      multiple: true,
      value: [0, '0', 0],
      selectedRows: rows,
    })
    expect(selection.value).toEqual([0, '0'])
    expect(selection.rows).toEqual(rows)
    expect(
      () =>
        new BasicTableSelectorSelection<Row>({
          rowKey: 'id',
          multiple: false,
          value: ['a', 'b'],
        }),
    ).toThrow('最多包含一个')
  })

  it('丢弃未确认快照不改变原选择，重开不继承上一轮对象缓存', () => {
    const original = new BasicTableSelectorSelection<Row>({
      rowKey: 'id',
      multiple: true,
      value: ['a'],
      selectedRows: [alice],
    })
    original.select({ value: ['b'], rows: [bob] })
    expect(original.rows).toEqual([alice])
    const reopened = new BasicTableSelectorSelection<Row>({
      rowKey: 'id',
      multiple: true,
      value: ['b'],
    })
    expect(reopened.missingKeys).toEqual(['b'])
  })
})
