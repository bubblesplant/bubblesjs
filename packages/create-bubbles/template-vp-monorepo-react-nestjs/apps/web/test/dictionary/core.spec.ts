import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { DictionaryOption, DictionaryReference, WorkspacesResult } from 'shared/types'
import { dictionaryKey } from 'shared/utils'
import { createDictionaryStore } from '../../src/store/dictionary/core'
import { DICTIONARY_TTL, type DictionarySnapshot } from '../../src/store/dictionary/model'

const companyId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const reference: DictionaryReference = { scope: { type: 'platform' }, code: 'units' }
const options = [
  { label: '米', value: 'm' },
  { label: '厘米', value: 'cm' },
]
const identity: WorkspacesResult = {
  user: { id: 'user-one', name: '测试用户', account: 'dict_qa' },
  workspaces: [
    { scope: { type: 'company', companyId }, name: '测试企业', administrator: 'company' },
    { scope: { type: 'project', companyId, projectId }, name: '测试项目', administrator: null },
  ],
}
/** 控制迟到结果，验证传输取消失效时 store 仍能阻止旧数据。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
/** 构造隔离的内存依赖，不触及真实认证或存储。 */
function setup() {
  let token: string | null = 'session-one'
  const deps = {
    session: () => token,
    identity: vi.fn().mockResolvedValue(identity),
    fetch: vi.fn().mockResolvedValue(options),
    read: vi.fn().mockReturnValue(undefined),
    save: vi.fn(),
    remove: vi.fn(),
  }
  const store = createDictionaryStore(deps)
  return {
    store,
    deps,
    setToken: (value: string | null) => {
      token = value
    },
  }
}
/** 创建未过期且归属正确的快照。 */
function snapshot(ref = reference): DictionarySnapshot {
  const now = Date.now()
  return {
    schemaVersion: 1,
    ownerUserId: identity.user.id,
    entries: {
      [dictionaryKey(ref)]: {
        ...ref,
        items: options,
        fetchedAt: now,
        expiresAt: now + DICTIONARY_TTL,
      },
    },
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T08:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('字典统一缓存', () => {
  it('同键并发只发一次，关键词各自过滤完整结果', async () => {
    const { store, deps } = setup()
    const result = await Promise.all([
      store.getState().ensureDictionary(reference),
      store.getState().ensureDictionary({ ...reference, keyWords: '厘米' }),
    ])
    expect(result).toEqual([options, [options[1]]])
    expect(deps.fetch).toHaveBeenCalledOnce()
    expect(deps.save.mock.calls.at(-1)![0].entries[dictionaryKey(reference)].items).toEqual(options)
  })
  it('命中后返回副本，调用者修改不污染缓存', async () => {
    const { store, deps } = setup()
    const data = await store.getState().ensureDictionary(reference)
    data[0]!.label = '被修改'
    expect(await store.getState().ensureDictionary(reference)).toEqual(options)
    expect(deps.fetch).toHaveBeenCalledOnce()
  })
  it('空数组是有效结果', async () => {
    const { store, deps } = setup()
    deps.fetch.mockResolvedValue([])
    await store.getState().ensureDictionary(reference)
    expect(await store.getState().ensureDictionary(reference)).toEqual([])
    expect(deps.fetch).toHaveBeenCalledOnce()
  })
  it('TTL 到期才重取，不返回过期结果', async () => {
    const { store, deps } = setup()
    await store.getState().ensureDictionary(reference)
    vi.advanceTimersByTime(DICTIONARY_TTL - 1)
    await store.getState().ensureDictionary(reference)
    expect(deps.fetch).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    await store.getState().ensureDictionary(reference)
    expect(deps.fetch).toHaveBeenCalledTimes(2)
  })
  it('失败不写成功缓存，下次允许重试', async () => {
    const { store, deps } = setup()
    deps.fetch.mockRejectedValueOnce(new Error('网络失败'))
    await expect(store.getState().ensureDictionary(reference)).rejects.toThrow('网络失败')
    expect(store.getState().entries).toEqual({})
    expect(deps.save).not.toHaveBeenCalled()
    await expect(store.getState().ensureDictionary(reference)).resolves.toEqual(options)
    expect(deps.fetch).toHaveBeenCalledTimes(2)
  })
  it('平台、企业和不同项目同编码互相隔离', async () => {
    const { store, deps } = setup()
    for (const scope of [
      reference.scope,
      { type: 'company' as const, companyId },
      { type: 'project' as const, companyId, projectId },
      { type: 'project' as const, companyId, projectId: 'other-project' },
    ])
      await store.getState().ensureDictionary({ scope, code: reference.code })
    expect(deps.fetch).toHaveBeenCalledTimes(4)
    expect(Object.keys(store.getState().entries)).toHaveLength(4)
  })
  it('先核对服务端身份才恢复匹配快照', async () => {
    const { store, deps } = setup()
    const pending = deferred<WorkspacesResult>()
    deps.identity.mockReturnValue(pending.promise)
    deps.read.mockReturnValue(snapshot())
    const loading = store.getState().ensureDictionary(reference)
    await Promise.resolve()
    expect(deps.read).not.toHaveBeenCalled()
    pending.resolve(identity)
    expect(await loading).toEqual(options)
    expect(deps.read).toHaveBeenCalledWith(identity.user.id)
    expect(deps.fetch).not.toHaveBeenCalled()
  })
  it('恢复时丢弃无访问资格的私有条目，仍交后端实时授权', async () => {
    const privateRef: DictionaryReference = {
      scope: { type: 'company', companyId: 'foreign' },
      code: 'units',
    }
    const { store, deps } = setup()
    deps.read.mockReturnValue(snapshot(privateRef))
    await store.getState().ensureDictionary(privateRef)
    expect(deps.fetch).toHaveBeenCalledOnce()
    expect(store.getState().entries[dictionaryKey(privateRef)]).toBeUndefined()
  })
  it('当前客户端保存后主动失效，其他键仍可复用', async () => {
    const { store, deps } = setup()
    const other = { ...reference, code: 'countries' }
    await store.getState().ensureDictionary(reference)
    await store.getState().ensureDictionary(other)
    store.getState().invalidate(reference)
    await store.getState().ensureDictionary(other)
    await store.getState().ensureDictionary(reference)
    expect(deps.fetch).toHaveBeenCalledTimes(3)
    expect(store.getState().revisions[dictionaryKey(reference)]).toBe(1)
  })
  it('首次恢复前主动失效也移除旧快照', () => {
    const { store, deps } = setup()
    store.getState().syncSession()
    store.getState().invalidate(reference)
    expect(deps.remove).toHaveBeenCalledOnce()
  })
  it('失效前迟到结果不能回填，也不能覆盖新请求', async () => {
    const { store, deps } = setup()
    const delayed = deferred<DictionaryOption[]>()
    deps.fetch.mockReturnValueOnce(delayed.promise)
    const previous = store.getState().ensureDictionary(reference)
    const rejected = expect(previous).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(deps.fetch).toHaveBeenCalledOnce())
    store.getState().invalidate(reference)
    await store.getState().ensureDictionary(reference)
    delayed.resolve([{ value: 'old', label: '旧值' }])
    await rejected
    expect(store.getState().entries[dictionaryKey(reference)]!.items).toEqual(options)
  })
  it('请求开始前换号不发送旧请求', async () => {
    const { store, deps, setToken } = setup()
    const previous = store.getState().ensureDictionary(reference)
    const rejected = expect(previous).rejects.toMatchObject({ name: 'AbortError' })
    setToken('session-two')
    await store.getState().ensureDictionary(reference)
    await rejected
    expect(deps.fetch).toHaveBeenCalledOnce()
  })
  it('退出清理专属持久化并阻止迟到回填', async () => {
    const { store, deps, setToken } = setup()
    const delayed = deferred<DictionaryOption[]>()
    deps.fetch.mockReturnValueOnce(delayed.promise)
    const previous = store.getState().ensureDictionary(reference)
    const rejected = expect(previous).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(deps.fetch).toHaveBeenCalledOnce())
    setToken(null)
    store.getState().syncSession()
    expect(deps.remove).toHaveBeenCalled()
    delayed.resolve(options)
    await rejected
    expect(store.getState().entries).toEqual({})
  })
  it('全失效保护权限撤销后的迟到响应', async () => {
    const { store, deps } = setup()
    const delayed = deferred<DictionaryOption[]>()
    deps.fetch.mockReturnValueOnce(delayed.promise)
    const previous = store.getState().ensureDictionary(reference)
    const rejected = expect(previous).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(deps.fetch).toHaveBeenCalledOnce())
    store.getState().invalidate()
    delayed.resolve(options)
    await rejected
    expect(store.getState().entries).toEqual({})
  })
  it('超过容量淘汰早期记录', async () => {
    const { store } = setup()
    for (let index = 0; index < 201; index++) {
      vi.advanceTimersByTime(1)
      await store.getState().ensureDictionary({ ...reference, code: `dict_${index}` })
    }
    expect(Object.keys(store.getState().entries)).toHaveLength(200)
    expect(
      store.getState().entries[dictionaryKey({ ...reference, code: 'dict_0' })],
    ).toBeUndefined()
  })
})
