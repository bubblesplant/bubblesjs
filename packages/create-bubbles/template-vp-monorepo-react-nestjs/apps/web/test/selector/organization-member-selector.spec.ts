import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { OrganizationMemberCandidate } from 'shared/types'
import type {
  OrganizationMemberBrowserProps,
  OrganizationMemberResourceFilters,
  OrganizationMemberSelectorProps,
} from '../../src/components/Selector/OrganizationMemberSelector/OrganizationMemberSelectorTypes'
import type { OrganizationMemberFilterValue } from '../../src/components/Selector/OrganizationMemberSelector/OrganizationMemberFilterPanel'

const hookRuntime = vi.hoisted(() => {
  type Cleanup = (() => void) | void
  interface EffectSlot {
    callback?: () => Cleanup
    cleanup?: () => void
    dependencies?: readonly unknown[]
    nextDependencies?: readonly unknown[]
    pending: boolean
  }
  interface MemoSlot {
    dependencies?: readonly unknown[]
    value: unknown
  }

  const states: unknown[] = []
  const refs: Array<{ current: unknown }> = []
  const effects: EffectSlot[] = []
  const memos: MemoSlot[] = []
  let stateIndex = 0
  let refIndex = 0
  let effectIndex = 0
  let memoIndex = 0

  /** 判断两次依赖是否符合 React 的变更语义。 */
  function dependenciesChanged(
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined,
  ) {
    if (!previous || !next || previous.length !== next.length) return true
    return next.some((item, index) => !Object.is(item, previous[index]))
  }

  return {
    /** 开始一轮组件渲染并重置各类 Hook 的读取位置。 */
    beginRender() {
      stateIndex = 0
      refIndex = 0
      effectIndex = 0
      memoIndex = 0
    },
    /** 执行本轮依赖发生变化的 effect。 */
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
    /** 卸载测试组件并清空所有 Hook 状态。 */
    reset() {
      for (const slot of effects) slot.cleanup?.()
      states.length = 0
      refs.length = 0
      effects.length = 0
      memos.length = 0
      stateIndex = 0
      refIndex = 0
      effectIndex = 0
      memoIndex = 0
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
    useImperativeHandle(this: void, ref: unknown, create: () => unknown) {
      const value = create()
      if (typeof ref === 'function') ref(value)
      else if (ref && typeof ref === 'object' && 'current' in ref) {
        ;(ref as { current: unknown }).current = value
      }
    },
    useMemo<T>(this: void, factory: () => T, dependencies?: readonly unknown[]) {
      const index = memoIndex++
      const slot = memos[index]
      if (slot && !dependenciesChanged(slot.dependencies, dependencies)) return slot.value as T
      const value = factory()
      memos[index] = { dependencies, value }
      return value
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
    useImperativeHandle: hookRuntime.useImperativeHandle,
    useMemo: hookRuntime.useMemo,
    useRef: hookRuntime.useRef,
    useState: hookRuntime.useState,
  }
})

vi.mock('@bubblesjs/i18n-react', () => ({
  useI18n: () => ({ tr: (message: string) => message }),
}))

vi.mock('antd', () => ({ Select: 'select' }))

vi.mock('../../src/components/Selector/BasicTableSelector', () => ({
  default: 'basic-table-selector',
}))

vi.mock(
  '../../src/components/Selector/OrganizationMemberSelector/OrganizationMemberCandidateColumns',
  () => ({ useOrganizationMemberCandidateColumns: () => [] }),
)

vi.mock(
  '../../src/components/Selector/OrganizationMemberSelector/OrganizationMemberFilterPanel',
  () => ({
    default: 'organization-member-filter-panel',
    createEmptyOrganizationMemberFilterValue: () => ({
      projectIds: [],
      organizationUnitIds: [],
      positionIds: [],
      roleIds: [],
      unassigned: false,
    }),
  }),
)

import OrganizationMemberBrowser from '../../src/components/Selector/OrganizationMemberSelector/OrganizationMemberBrowser'
import OrganizationMemberSelector from '../../src/components/Selector/OrganizationMemberSelector/OrganizationMemberSelector'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

interface SelectorElement {
  props: {
    options: Array<{ value: string; label: string }>
  }
}

interface BrowserElement {
  props: {
    sidePanel: {
      props: {
        onChange: (value: OrganizationMemberFilterValue) => void
        resourceFilters?: OrganizationMemberResourceFilters
      }
    }
  }
}

/** 创建可由测试显式完成或拒绝的 Promise。 */
function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined
  let rejectPromise: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

/** 创建用于回显断言的组织成员候选。 */
function candidate(userId: string, name: string): OrganizationMemberCandidate {
  return {
    userId,
    name,
    account: `${name.toLowerCase()}@example.com`,
    accountStatus: 'active',
    disabled: false,
    disabledReason: null,
    identities: [],
  }
}

/** 执行一次选择器渲染并取得其 Select 元素。 */
function renderSelector(props: OrganizationMemberSelectorProps): SelectorElement {
  hookRuntime.beginRender()
  const fragment = OrganizationMemberSelector(props) as unknown as {
    props: { children: [SelectorElement, unknown] }
  }
  return fragment.props.children[0]
}

/** 执行一次成员浏览器渲染并取得表格选择器属性。 */
function renderBrowser(props: OrganizationMemberBrowserProps): BrowserElement {
  hookRuntime.beginRender()
  return OrganizationMemberBrowser(props) as unknown as BrowserElement
}

/** 等待 Promise 的 then、catch 与 finally 链全部执行。 */
async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

/** 切换到指定项目身份域。 */
function selectProjects(browser: BrowserElement, projectIds: string[]) {
  browser.props.sidePanel.props.onChange({
    projectIds,
    organizationUnitIds: [],
    positionIds: [],
    roleIds: [],
    unassigned: false,
  })
}

const emptyRequest: OrganizationMemberSelectorProps['request'] = async () => ({
  items: [],
  total: 0,
})
const companyScope = { type: 'company' as const, label: '企业 A' }

describe('OrganizationMemberSelector 候选回显补查', () => {
  beforeEach(() => hookRuntime.reset())
  afterEach(() => hookRuntime.reset())

  it('已有 A 快照时仍会延迟补查 B 并完整回显', async () => {
    const alice = candidate('user-a', 'Alice')
    const bob = candidate('user-b', 'Bob')
    const pending = deferred<OrganizationMemberCandidate[]>()
    const resolve = vi.fn(() => pending.promise)
    const props = {
      value: [alice.userId, bob.userId],
      multiple: true,
      selectedCandidates: [alice],
      candidateContextKey: 'company-a:browseOrganization',
      scope: companyScope,
      request: emptyRequest,
      resolve,
    }

    renderSelector(props)
    hookRuntime.flushEffects()
    expect(resolve).toHaveBeenCalledExactlyOnceWith([bob.userId])

    pending.resolve([bob])
    await flushMicrotasks()
    const select = renderSelector(props)

    expect(select.props.options).toEqual([
      { value: alice.userId, label: 'Alice · alice@example.com' },
      { value: bob.userId, label: 'Bob · bob@example.com' },
    ])
  })

  it('pending 期间同内容的新快照数组不会取消或重复补查', async () => {
    const alice = candidate('user-a', 'Alice')
    const bob = candidate('user-b', 'Bob')
    const pending = deferred<OrganizationMemberCandidate[]>()
    const resolve = vi.fn(() => pending.promise)
    const baseProps = {
      value: [alice.userId, bob.userId],
      multiple: true,
      candidateContextKey: 'company-a:browseOrganization',
      scope: companyScope,
      request: emptyRequest,
      resolve,
    }

    renderSelector({ ...baseProps, selectedCandidates: [alice] })
    hookRuntime.flushEffects()
    renderSelector({ ...baseProps, selectedCandidates: [alice] })
    hookRuntime.flushEffects()
    expect(resolve).toHaveBeenCalledTimes(1)

    pending.resolve([bob])
    await flushMicrotasks()
    const select = renderSelector({ ...baseProps, selectedCandidates: [alice] })

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(select.props.options[1]).toEqual({
      value: bob.userId,
      label: 'Bob · bob@example.com',
    })
  })

  it('上下文切换后重新补查同一 userId，并忽略旧上下文迟到结果', async () => {
    const oldCandidate = candidate('user-a', 'Old')
    const newCandidate = candidate('user-a', 'New')
    const oldRequest = deferred<OrganizationMemberCandidate[]>()
    const newRequest = deferred<OrganizationMemberCandidate[]>()
    const resolve = vi
      .fn<OrganizationMemberSelectorProps['resolve']>()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise)
    const baseProps = {
      value: oldCandidate.userId,
      scope: companyScope,
      request: emptyRequest,
      resolve,
    }

    renderSelector({ ...baseProps, candidateContextKey: 'context-x' })
    hookRuntime.flushEffects()
    renderSelector({ ...baseProps, candidateContextKey: 'context-y' })
    hookRuntime.flushEffects()
    expect(resolve).toHaveBeenNthCalledWith(1, [oldCandidate.userId])
    expect(resolve).toHaveBeenNthCalledWith(2, [oldCandidate.userId])

    newRequest.resolve([newCandidate])
    await flushMicrotasks()
    oldRequest.resolve([oldCandidate])
    await flushMicrotasks()
    const select = renderSelector({ ...baseProps, candidateContextKey: 'context-y' })

    expect(select.props.options).toEqual([
      { value: newCandidate.userId, label: 'New · new@example.com' },
    ])
  })

  it('补查失败后换上下文可对相同缺失集合重试', async () => {
    const alice = candidate('user-a', 'Alice')
    const failedRequest = deferred<OrganizationMemberCandidate[]>()
    const retryRequest = deferred<OrganizationMemberCandidate[]>()
    const resolve = vi
      .fn<OrganizationMemberSelectorProps['resolve']>()
      .mockImplementationOnce(() => failedRequest.promise)
      .mockImplementationOnce(() => retryRequest.promise)
    const baseProps = { value: alice.userId, scope: companyScope, request: emptyRequest, resolve }

    renderSelector({ ...baseProps, candidateContextKey: 'context-x' })
    hookRuntime.flushEffects()
    failedRequest.reject(new Error('resolve failed'))
    await flushMicrotasks()
    renderSelector({ ...baseProps, candidateContextKey: 'context-y' })
    hookRuntime.flushEffects()

    expect(resolve).toHaveBeenCalledTimes(2)
    retryRequest.resolve([alice])
    await flushMicrotasks()
    const select = renderSelector({ ...baseProps, candidateContextKey: 'context-y' })
    expect(select.props.options[0]?.label).toBe('Alice · alice@example.com')
  })
})

describe('OrganizationMemberBrowser 项目筛选竞态', () => {
  beforeEach(() => hookRuntime.reset())
  afterEach(() => hookRuntime.reset())

  it('相同 projectIds 更换 loader 后旧结果不能覆盖新结果', async () => {
    const oldRequest = deferred<OrganizationMemberResourceFilters>()
    const newRequest = deferred<OrganizationMemberResourceFilters>()
    const oldLoader = vi.fn(() => oldRequest.promise)
    const newLoader = vi.fn(() => newRequest.promise)
    const ref = { current: null }
    const baseProps = {
      ref,
      candidateContextKey: 'company-a:browseOrganization',
      scope: companyScope,
      request: emptyRequest,
      resolve: async () => [],
      onConfirm: () => undefined,
    }
    const oldProps = { ...baseProps, filters: { loadProjectFilters: oldLoader } }

    let browser = renderBrowser(oldProps)
    hookRuntime.flushEffects()
    selectProjects(browser, ['project-a'])
    browser = renderBrowser(oldProps)
    hookRuntime.flushEffects()

    const newProps = { ...baseProps, filters: { loadProjectFilters: newLoader } }
    renderBrowser(newProps)
    hookRuntime.flushEffects()
    newRequest.resolve({ roles: [{ value: 'new', label: '新角色' }] })
    await flushMicrotasks()
    oldRequest.resolve({ roles: [{ value: 'old', label: '旧角色' }] })
    await flushMicrotasks()
    browser = renderBrowser(newProps)

    expect(oldLoader).toHaveBeenCalledExactlyOnceWith(['project-a'])
    expect(newLoader).toHaveBeenCalledExactlyOnceWith(['project-a'])
    expect(browser.props.sidePanel.props.resourceFilters?.roles).toEqual([
      { value: 'new', label: '新角色' },
    ])
  })

  it('相同 projectIds 切换 candidateContextKey 后旧结果不能覆盖新结果', async () => {
    const oldRequest = deferred<OrganizationMemberResourceFilters>()
    const newRequest = deferred<OrganizationMemberResourceFilters>()
    const loader = vi
      .fn<
        NonNullable<NonNullable<OrganizationMemberBrowserProps['filters']>['loadProjectFilters']>
      >()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise)
    const ref = { current: null }
    const baseProps = {
      ref,
      scope: companyScope,
      filters: { loadProjectFilters: loader },
      request: emptyRequest,
      resolve: async () => [],
      onConfirm: () => undefined,
    }
    const oldProps = { ...baseProps, candidateContextKey: 'context-x' }

    let browser = renderBrowser(oldProps)
    hookRuntime.flushEffects()
    selectProjects(browser, ['project-a'])
    browser = renderBrowser(oldProps)
    hookRuntime.flushEffects()

    const newProps = { ...baseProps, candidateContextKey: 'context-y' }
    renderBrowser(newProps)
    hookRuntime.flushEffects()
    newRequest.resolve({ positions: [{ value: 'new', label: '新岗位' }] })
    await flushMicrotasks()
    oldRequest.resolve({ positions: [{ value: 'old', label: '旧岗位' }] })
    await flushMicrotasks()
    browser = renderBrowser(newProps)

    expect(loader).toHaveBeenCalledTimes(2)
    expect(browser.props.sidePanel.props.resourceFilters?.positions).toEqual([
      { value: 'new', label: '新岗位' },
    ])
  })
})
