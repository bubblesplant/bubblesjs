// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { AxiosError, AxiosHeaders } from 'axios'
import type { DictionaryOption, WorkspacesResult } from 'shared/types'

const api = vi.hoisted(() => ({
  getWorkspaces: vi.fn(),
  getWorkspaceUser: vi.fn(),
  fetchDictionaryItems: vi.fn(),
  navigate: vi.fn(),
  errorMessage: vi.fn(),
}))
vi.mock('../../src/pages/workspaces/api', () => api)
vi.mock('../../src/pages/dictionaries/api', () => api)
vi.mock('../../src/router', () => ({ navigator: api.navigate }))
vi.mock('../../src/utils/env', () => ({ envVariables: { API_AFFIX: '' } }))
vi.mock('antd', () => ({ message: { error: api.errorMessage } }))

const data: WorkspacesResult = {
  user: { id: 'user-one', name: '测试用户', account: 'test_user' },
  workspaces: [{ scope: { type: 'platform' }, name: '平台', administrator: 'platform' }],
}
const reference = { scope: { type: 'platform' as const }, code: 'units' }
const items: DictionaryOption[] = [{ label: '米', value: 'm' }]
let cookie: typeof import('../../src/utils/storage/cookie').cookie
let user: typeof import('../../src/store/user').useUserStore
let dictionary: typeof import('../../src/store/dictionary').dictionaryStore
let workspace: typeof import('../../src/utils/request/workspace')
let unauthorized: typeof import('../../src/utils/request/utils').unAuthorizedResponseFunc
const registrations: Array<{ name: string; listener: EventListenerOrEventListenerObject }> = []

/** 手动返回迟到结果，验证事件取消之后不会重新写入旧会话。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  // 避免 happy-dom 在同一毫秒内仍返回 Max-Age=0 的空值 Cookie。
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now++)
  localStorage.clear()
  sessionStorage.clear()
  cookie = (await import('../../src/utils/storage/cookie')).cookie
  cookie.set('token', 'session-one')
  api.getWorkspaces.mockReset().mockResolvedValue(data)
  api.getWorkspaceUser.mockReset().mockResolvedValue(data.user)
  api.fetchDictionaryItems.mockReset().mockResolvedValue(items)
  const add = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((name, listener, options) => {
    if (listener) registrations.push({ name, listener })
    add(name, listener, options)
  })
  user = (await import('../../src/store/user')).useUserStore
  dictionary = (await import('../../src/store/dictionary')).dictionaryStore
  workspace = await import('../../src/utils/request/workspace')
  unauthorized = (await import('../../src/utils/request/utils')).unAuthorizedResponseFunc
})

afterEach(() => {
  for (const { name, listener } of registrations.splice(0))
    window.removeEventListener(name, listener)
  workspace.clearWorkspaceRequests()
  cookie.remove('token')
  vi.restoreAllMocks()
})

/** 先从真实 store 动作建立用户、权限和字典缓存。 */
async function loadSession() {
  await user.getState().ensureWorkspaces()
  user.getState().setWorkspaceAccess('platform', {
    user: data.user,
    scope: { type: 'platform' },
    administrator: 'platform',
    permissionKeys: ['dictionary.read'],
    menus: [],
    menuVersion: 1,
    catalogVersion: 'test',
  })
  await dictionary.getState().ensureDictionary(reference)
  expect(user.getState().accessByScope.size).toBe(1)
  expect(Object.keys(dictionary.getState().entries)).toHaveLength(1)
  expect(localStorage.getItem('workspace-display-cache')).not.toBeNull()
  expect(sessionStorage.getItem('bubbles.dictionary-cache')).not.toBeNull()
}

/** 验证所有已加载模块的会话数据与各自快照同步清空。 */
function expectEmptySession() {
  expect(cookie.get('token')).toBeNull()
  expect(user.getState()).toMatchObject({
    workspaces: undefined,
    status: 'idle',
    loading: false,
    updatedAt: 0,
    error: undefined,
  })
  expect(user.getState().accessByScope.size).toBe(0)
  expect(dictionary.getState().entries).toEqual({})
  expect(localStorage.getItem('workspace-display-cache')).toBeNull()
  expect(sessionStorage.getItem('bubbles.dictionary-cache')).toBeNull()
}

describe('统一登录失效的真实会话事件', () => {
  it('会话级 401 清空内存和快照，中止空间、用户、字典在途请求并拒绝迟到数据', async () => {
    await loadSession()
    const dictionaryPending = deferred<DictionaryOption[]>()
    api.fetchDictionaryItems.mockReturnValueOnce(dictionaryPending.promise)
    const dictionaryResult = dictionary
      .getState()
      .ensureDictionary({ ...reference, code: 'late_units' })
    const dictionaryRejected = expect(dictionaryResult).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.waitFor(() => expect(api.fetchDictionaryItems).toHaveBeenCalledTimes(2))
    const dictionarySignal = api.fetchDictionaryItems.mock.calls[1]![0].signal as AbortSignal

    const userPending = deferred<WorkspacesResult>()
    api.getWorkspaces.mockReturnValueOnce(userPending.promise)
    const userResult = user.getState().ensureWorkspaces({ refresh: true })
    const userRejected = expect(userResult).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(api.getWorkspaces).toHaveBeenCalledTimes(2))
    const userSignal = api.getWorkspaces.mock.calls[1]![0].signal as AbortSignal

    workspace.enterWorkspace('platform')
    const spacePending = deferred<string>()
    const spaceMethod = { send: () => spacePending.promise, abort: vi.fn() }
    const spaceResult = workspace.runWorkspaceRequest({
      method: spaceMethod,
      workspaceKey: 'platform',
    })
    const spaceRejected = expect(spaceResult).rejects.toMatchObject({ name: 'AbortError' })
    const error = new AxiosError('会话已失效', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 401,
      statusText: 'Unauthorized',
      data: { message: '会话已失效' },
      headers: {},
      config: { headers: new AxiosHeaders() },
    })
    await expect(
      workspace.runSessionRequest({
        method: { send: () => Promise.reject(error), abort: vi.fn() },
      }),
    ).rejects.toBe(error)

    expectEmptySession()
    expect(spaceMethod.abort).toHaveBeenCalledOnce()
    expect(userSignal.aborted).toBe(true)
    expect(dictionarySignal.aborted).toBe(true)
    userPending.resolve(data)
    dictionaryPending.resolve(items)
    spacePending.resolve('旧空间数据')
    await Promise.all([userRejected, dictionaryRejected, spaceRejected])
    expectEmptySession()
    expect(api.errorMessage).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(api.navigate).toHaveBeenCalledExactlyOnceWith('/login'))
  })

  it('令牌已自然过期且 store 已观察到空会话，仍清掉残留状态并使空间请求失效', async () => {
    await loadSession()
    const previousUser = user.getState()
    const previousEntries = dictionary.getState().entries
    document.cookie = 'token=; Max-Age=0; Path=/'
    user.getState().syncSession()
    dictionary.getState().syncSession()
    // 模拟空会话中仍残留的展示数据；删除令牌事件必须强制清理，不能只比较 token。
    user.setState({
      workspaces: previousUser.workspaces,
      accessByScope: previousUser.accessByScope,
      status: 'ready',
    })
    dictionary.setState({ entries: previousEntries })
    localStorage.setItem('workspace-display-cache', 'residual snapshot')
    sessionStorage.setItem('bubbles.dictionary-cache', 'residual snapshot')
    workspace.enterWorkspace('platform')
    const late = deferred<string>()
    const method = { send: () => late.promise, abort: vi.fn() }
    const result = workspace.runWorkspaceRequest({ method, workspaceKey: 'platform' })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })

    unauthorized()
    unauthorized()

    expectEmptySession()
    expect(method.abort).toHaveBeenCalledOnce()
    late.resolve('过期会话数据')
    await rejected
    expectEmptySession()
    expect(api.errorMessage).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(api.navigate).toHaveBeenCalledExactlyOnceWith('/login'))
  })
})
