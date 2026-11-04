import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { GlobalAccountOption, GlobalAccountSelectProps } from '../../src/components/Selector'

const hookRuntime = vi.hoisted(() => {
  type Cleanup = (() => void) | void
  interface EffectSlot {
    callback?: () => Cleanup
    cleanup?: () => void
    dependencies?: readonly unknown[]
    nextDependencies?: readonly unknown[]
    pending: boolean
  }

  const states: unknown[] = []
  const refs: Array<{ current: unknown }> = []
  const effects: EffectSlot[] = []
  let stateIndex = 0
  let refIndex = 0
  let effectIndex = 0

  /** 判断依赖数组是否发生 React effect 语义下的变化。 */
  function dependenciesChanged(
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined,
  ) {
    if (!previous || !next || previous.length !== next.length) return true
    return next.some((item, index) => !Object.is(item, previous[index]))
  }

  return {
    /** 开始一次组件函数渲染，并重置各类 Hook 的读取位置。 */
    beginRender() {
      stateIndex = 0
      refIndex = 0
      effectIndex = 0
    },
    /** 执行本轮发生依赖变化的 effect，并先清理上一轮副作用。 */
    flushEffects() {
      for (const slot of effects) {
        if (!slot.pending || !slot.callback) continue
        slot.cleanup?.()
        const cleanup = slot.callback()
        slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined
        slot.dependencies = slot.nextDependencies
        slot.pending = false
      }
    },
    /** 卸载当前测试组件并清空 Hook 状态。 */
    reset() {
      for (const slot of effects) slot.cleanup?.()
      states.length = 0
      refs.length = 0
      effects.length = 0
      stateIndex = 0
      refIndex = 0
      effectIndex = 0
    },
    useEffect(this: void, callback: () => Cleanup, dependencies?: readonly unknown[]) {
      const index = effectIndex++
      const slot = effects[index] ?? { pending: false }
      effects[index] = slot
      if (!dependenciesChanged(slot.dependencies, dependencies)) return
      slot.callback = callback
      slot.nextDependencies = dependencies
      slot.pending = true
    },
    useRef<T>(this: void, initialValue?: T) {
      const index = refIndex++
      if (!refs[index]) refs[index] = { current: initialValue }
      return refs[index] as { current: T }
    },
    useState<T>(this: void, initialValue: T | (() => T)) {
      const index = stateIndex++
      if (!(index in states)) {
        states[index] =
          typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
      }
      const setValue = (nextValue: T | ((current: T) => T)) => {
        const current = states[index] as T
        states[index] =
          typeof nextValue === 'function' ? (nextValue as (value: T) => T)(current) : nextValue
      }
      return [states[index] as T, setValue] as const
    },
  }
})

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<Record<string, unknown>>()
  return {
    ...react,
    useEffect: hookRuntime.useEffect,
    useRef: hookRuntime.useRef,
    useState: hookRuntime.useState,
  }
})

vi.mock('@bubblesjs/i18n-react', () => ({
  useI18n: () => ({ tr: (message: string) => message }),
}))

vi.mock('antd', () => ({
  Flex: 'div',
  Select: 'select',
  Spin: 'span',
  Tag: 'span',
  Typography: { Text: 'span' },
}))

vi.mock('../../src/components/Selector/GlobalAccountSelect/GlobalAccountBrowser', () => ({
  default: 'account-browser',
}))

import GlobalAccountSelect from '../../src/components/Selector/GlobalAccountSelect'

interface SelectElement {
  props: {
    value?: string | string[]
    mode?: 'multiple'
    onChange: (value: string | string[] | undefined) => void
    labelRender: (input: { value?: string }) => unknown
    loading: boolean
    options: Array<{ value: string; label: string }>
    open: boolean
    showSearch: boolean
  }
}

interface FieldElement {
  props: {
    children: [SelectElement, { props: { onConfirm: (accounts: GlobalAccountOption[]) => void } }]
  }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

/** 创建可由测试显式完成的 Promise。 */
function deferred<T>(): Deferred<T> {
  let complete: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    complete = resolve
  })
  return { promise, resolve: complete }
}

/** 创建满足选择器契约的启用账号候选。 */
function account(userId: string, name: string): GlobalAccountOption {
  return {
    userId,
    name,
    account: `${name.toLowerCase()}@example.com`,
    status: 'active',
    disabled: false,
    disabledReason: null,
  }
}

/** 使用轻量 Hook 运行时执行一次组件渲染并返回 Select 属性。 */
function renderSelect(props: GlobalAccountSelectProps) {
  hookRuntime.beginRender()
  return (GlobalAccountSelect(props) as unknown as FieldElement).props.children[0]
}

/** 等待补查 Promise 的 then、catch 与 finally 链全部完成。 */
async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const emptySearch: GlobalAccountSelectProps['request'] = async () => ({ items: [], total: 0 })

describe('GlobalAccountSelect 的 userId 回显补查', () => {
  beforeEach(() => {
    hookRuntime.reset()
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout,
    })
  })

  afterEach(() => {
    hookRuntime.reset()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('初始 userId 通过 resolve 回显姓名和完整账号', async () => {
    const alice = account('user-alice', 'Alice')
    const resolve = vi.fn(async () => [alice])

    renderSelect({ value: [alice.userId], request: emptySearch, resolve })
    hookRuntime.flushEffects()
    await flushMicrotasks()
    const select = renderSelect({ value: [alice.userId], request: emptySearch, resolve })

    expect(resolve).toHaveBeenCalledExactlyOnceWith([alice.userId], expect.any(AbortSignal))
    expect(select.props.labelRender({ value: alice.userId })).toBe('Alice · alice@example.com')
  })

  it('重渲染不会取消正在进行的账号回显补查', async () => {
    const alice = account('user-alice', 'Alice')
    const pendingResolve = deferred<readonly GlobalAccountOption[]>()
    const signals: AbortSignal[] = []
    const resolve = vi.fn((_userIds: readonly string[], signal: AbortSignal) => {
      signals.push(signal)
      return pendingResolve.promise
    })
    const props = { value: [alice.userId], request: emptySearch, resolve }

    renderSelect(props)
    hookRuntime.flushEffects()

    // 模拟 effect 内 setResolving(true) 触发的真实 React 重渲染。
    renderSelect(props)
    hookRuntime.flushEffects()
    expect(signals[0]?.aborted).toBe(false)

    pendingResolve.resolve([alice])
    await flushMicrotasks()
    const select = renderSelect(props)

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(select.props.labelRender({ value: alice.userId })).toBe('Alice · alice@example.com')
  })

  it('value 切换时取消旧补查并忽略过期结果', async () => {
    const alice = account('user-alice', 'Alice')
    const bob = account('user-bob', 'Bob')
    const aliceRequest = deferred<readonly GlobalAccountOption[]>()
    const bobRequest = deferred<readonly GlobalAccountOption[]>()
    const signals: AbortSignal[] = []
    const resolve = vi.fn((userIds: readonly string[], signal: AbortSignal) => {
      signals.push(signal)
      return userIds[0] === alice.userId ? aliceRequest.promise : bobRequest.promise
    })

    renderSelect({ value: [alice.userId], request: emptySearch, resolve })
    hookRuntime.flushEffects()
    renderSelect({ value: [bob.userId], request: emptySearch, resolve })
    hookRuntime.flushEffects()
    expect(signals[0]?.aborted).toBe(true)

    bobRequest.resolve([bob])
    aliceRequest.resolve([alice])
    await flushMicrotasks()
    const select = renderSelect({ value: [bob.userId], request: emptySearch, resolve })

    expect(resolve).toHaveBeenCalledTimes(2)
    expect(select.props.labelRender({ value: bob.userId })).toBe('Bob · bob@example.com')
  })

  it('空补查结果不伪造账号，也不会在重渲染时重复请求', async () => {
    const resolve = vi.fn(async () => [])
    const props = { value: ['missing-user'], request: emptySearch, resolve }

    renderSelect(props)
    hookRuntime.flushEffects()
    await flushMicrotasks()
    renderSelect(props)
    hookRuntime.flushEffects()
    const select = renderSelect(props)
    hookRuntime.flushEffects()

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(select.props.labelRender({ value: 'missing-user' })).toBe('账号信息不可用')
  })

  it('补查失败后仍可通过弹窗确认新账号，字段不预加载候选', async () => {
    const alice = account('user-alice', 'Alice')
    const resolve = vi.fn(async () => {
      throw new Error('resolve failed')
    })
    const request = vi.fn(async () => ({ items: [alice], total: 1 }))
    const onChange = vi.fn()
    const props = { value: ['missing-user'], request, resolve, onChange }
    renderSelect(props)
    hookRuntime.flushEffects()
    await flushMicrotasks()
    hookRuntime.beginRender()
    const field = GlobalAccountSelect(props) as unknown as FieldElement
    expect(field.props.children[0].props.open).toBe(false)
    expect(field.props.children[0].props.showSearch).toBe(false)
    expect(request).not.toHaveBeenCalled()
    field.props.children[1].props.onConfirm([alice])
    expect(onChange).toHaveBeenCalledExactlyOnceWith([alice.userId], [alice])
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('已提供账号快照时直接回显且不发起补查', () => {
    const alice = account('user-alice', 'Alice')
    const resolve = vi.fn(async () => [alice])
    const select = renderSelect({
      value: [alice.userId],
      selectedAccount: alice,
      request: emptySearch,
      resolve,
    })
    hookRuntime.flushEffects()

    expect(resolve).not.toHaveBeenCalled()
    expect(select.props.labelRender({ value: alice.userId })).toBe('Alice · alice@example.com')
  })

  it('多选批量补齐缺失快照并按去重后的值顺序回显', async () => {
    const alice = account('user-alice', 'Alice')
    const bob = account('user-bob', 'Bob')
    const carol = account('user-carol', 'Carol')
    const resolve = vi.fn(async () => [carol, bob])
    const onChange = vi.fn()
    const props = {
      multiple: true,
      value: [bob.userId, alice.userId, bob.userId, carol.userId],
      selectedAccounts: [alice],
      request: emptySearch,
      resolve,
      onChange,
    }
    renderSelect(props)
    hookRuntime.flushEffects()
    await flushMicrotasks()
    const select = renderSelect(props)
    expect(resolve).toHaveBeenCalledExactlyOnceWith(
      [bob.userId, carol.userId],
      expect.any(AbortSignal),
    )
    expect(select.props.options.map((option) => option.value)).toEqual([
      bob.userId,
      alice.userId,
      carol.userId,
    ])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('单选对外部多项值只回显首项，确认和清空始终输出数组', () => {
    const alice = account('user-alice', 'Alice')
    const bob = account('user-bob', 'Bob')
    const onChange = vi.fn()
    const props = {
      multiple: false,
      value: [alice.userId, bob.userId],
      selectedAccounts: [alice, bob],
      request: emptySearch,
      resolve: vi.fn(async () => []),
      onChange,
    }
    const select = renderSelect(props)
    expect(select.props.value).toBe(alice.userId)
    expect(select.props.mode).toBeUndefined()
    expect(onChange).not.toHaveBeenCalled()
    hookRuntime.beginRender()
    const field = GlobalAccountSelect(props) as unknown as FieldElement
    field.props.children[1].props.onConfirm([bob, alice])
    expect(onChange).toHaveBeenLastCalledWith([bob.userId], [bob])
    select.props.onChange(undefined)
    expect(onChange).toHaveBeenLastCalledWith([], [])
  })

  it('多选确认保持 ID 和快照同序，删除标签只保留对应快照', () => {
    const alice = account('user-alice', 'Alice')
    const bob = account('user-bob', 'Bob')
    const onChange = vi.fn()
    const props = {
      multiple: true,
      value: [bob.userId, alice.userId],
      selectedAccounts: [alice, bob],
      request: emptySearch,
      resolve: vi.fn(async () => []),
      onChange,
    }
    hookRuntime.beginRender()
    const field = GlobalAccountSelect(props) as unknown as FieldElement
    field.props.children[1].props.onConfirm([bob, alice, bob])
    expect(onChange).toHaveBeenLastCalledWith([bob.userId, alice.userId], [bob, alice])
    field.props.children[0].props.onChange([alice.userId])
    expect(onChange).toHaveBeenLastCalledWith([alice.userId], [alice])
    field.props.children[0].props.onChange([])
    expect(onChange).toHaveBeenLastCalledWith([], [])
  })
})
