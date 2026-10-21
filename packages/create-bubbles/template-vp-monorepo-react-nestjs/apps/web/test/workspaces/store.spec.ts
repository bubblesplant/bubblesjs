// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vite-plus/test'
import type { AccessContext, WorkspacesResult } from 'shared/types'
import { api, data, deferred, storageKey, store } from './config'
import { cookie } from '../../src/utils/storage/cookie'

describe('工作空间全局 store', () => {
  it('Zustand 权限动作通知订阅者，并保持原 Map 快照不变', () => {
    const access: AccessContext = {
      user: data.user,
      scope: { type: 'company', companyId: 'company-one' },
      administrator: null,
      permissionKeys: ['company.home.read'],
      menus: [],
      menuVersion: 1,
      catalogVersion: 'v1',
    }
    const initial = store.getState().accessByScope
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.getState().setWorkspaceAccess('company:company-one', access)
    const granted = store.getState().accessByScope
    expect(granted.get('company:company-one')).toEqual(access)
    expect(initial.size).toBe(0)
    store.getState().removeWorkspaceAccess('company:company-one')
    expect(store.getState().accessByScope.size).toBe(0)
    expect(granted.has('company:company-one')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(storageKey)).toBeNull()
    unsubscribe()
  })

  it('请求微任务开始前换号，只发送新会话请求', async () => {
    const previous = store.getState().ensureWorkspaces()
    const rejected = expect(previous).rejects.toMatchObject({ name: 'AbortError' })
    cookie.set('token', 'session-two')
    const next = { ...data, user: { ...data.user, id: 'user-two' }, workspaces: [] }
    api.getWorkspaces.mockResolvedValueOnce(next)
    await expect(store.getState().ensureWorkspaces()).resolves.toEqual(next)
    await rejected
    expect(api.getWorkspaces).toHaveBeenCalledOnce()
    expect(store.getState().workspaces).toEqual(next)
  })

  it('并发首次读取合并，空列表也作为成功结果复用', async () => {
    const response = deferred<WorkspacesResult>()
    api.getWorkspaces.mockReturnValueOnce(response.promise)
    const first = store.getState().ensureWorkspaces()
    const second = store.getState().ensureWorkspaces()
    await vi.waitFor(() => expect(api.getWorkspaces).toHaveBeenCalledOnce())
    response.resolve({ ...data, workspaces: [] })
    await expect(first).resolves.toMatchObject({ workspaces: [] })
    await expect(second).resolves.toMatchObject({ workspaces: [] })
    await expect(store.getState().ensureWorkspaces()).resolves.toMatchObject({ workspaces: [] })
    expect(api.getWorkspaces).toHaveBeenCalledOnce()
  })

  it('多个明确刷新共享请求，刷新结果通知所有订阅者', async () => {
    await store.getState().ensureWorkspaces()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const response = deferred<WorkspacesResult>()
    api.getWorkspaces.mockReturnValueOnce(response.promise)
    const first = store.getState().ensureWorkspaces({ refresh: true })
    const second = store.getState().ensureWorkspaces({ refresh: true })
    await vi.waitFor(() => expect(api.getWorkspaces).toHaveBeenCalledTimes(2))
    expect(store.getState().loading).toBe(true)
    response.resolve({ ...data, workspaces: [] })
    await Promise.all([first, second])
    expect(listener).toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ status: 'ready', loading: false })
    unsubscribe()
  })

  it('请求开始后的业务变更使旧结果失效，补取一次最新列表', async () => {
    const response = deferred<WorkspacesResult>()
    api.getWorkspaces
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce({ ...data, workspaces: [] })
    const result = store.getState().ensureWorkspaces()
    await vi.waitFor(() => expect(api.getWorkspaces).toHaveBeenCalledOnce())
    store.getState().invalidateWorkspaces()
    response.resolve(data)
    await expect(result).resolves.toMatchObject({ workspaces: [] })
    expect(api.getWorkspaces).toHaveBeenCalledTimes(2)
    expect(JSON.parse(localStorage.getItem(storageKey)!).workspaces).toEqual([])
  })

  it('某个路由取消立即结束该等待，不中断另一个消费者的共享请求', async () => {
    const response = deferred<WorkspacesResult>()
    const controller = new AbortController()
    api.getWorkspaces.mockReturnValueOnce(response.promise)
    const canceled = store.getState().ensureWorkspaces({ signal: controller.signal })
    const active = store.getState().ensureWorkspaces()
    const rejected = expect(canceled).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(api.getWorkspaces).toHaveBeenCalledOnce())
    controller.abort()
    await rejected
    expect(api.getWorkspaces.mock.calls[0]?.[0].signal.aborted).toBe(false)
    response.resolve(data)
    await expect(active).resolves.toEqual(data)
    expect(api.getWorkspaces).toHaveBeenCalledOnce()
  })

  it('取消后的等待不发新请求，也不清除有效结果', async () => {
    await store.getState().ensureWorkspaces()
    const controller = new AbortController()
    controller.abort()
    await expect(
      store.getState().ensureWorkspaces({ signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(store.getState().workspaces).toEqual(data)
    expect(api.getWorkspaces).toHaveBeenCalledOnce()
  })

  it('换号立即中止旧操作并清除快照，迟到响应不能回写', async () => {
    await store.getState().ensureWorkspaces()
    const response = deferred<WorkspacesResult>()
    api.getWorkspaces.mockReturnValueOnce(response.promise)
    const previous = store.getState().ensureWorkspaces({ refresh: true })
    const rejected = expect(previous).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(api.getWorkspaces).toHaveBeenCalledTimes(2))
    cookie.set('token', 'session-two')
    expect(store.getState().workspaces).toBeUndefined()
    expect(localStorage.getItem(storageKey)).toBeNull()
    expect(api.getWorkspaces.mock.calls[1]?.[0].signal.aborted).toBe(true)
    const next = { ...data, user: { ...data.user, id: 'user-two' }, workspaces: [] }
    api.getWorkspaces.mockResolvedValueOnce(next)
    await expect(store.getState().ensureWorkspaces()).resolves.toEqual(next)
    response.resolve(data)
    await rejected
    expect(store.getState().workspaces).toEqual(next)
  })

  it('退出清除内存、权限和本地快照', async () => {
    await store.getState().ensureWorkspaces()
    cookie.remove('token')
    expect(store.getState().workspaces).toBeUndefined()
    expect(store.getState().accessByScope.size).toBe(0)
    expect(localStorage.getItem(storageKey)).toBeNull()
  })

  it('其他标签页清理缓存会清除本页状态并通知路由刷新', async () => {
    await store.getState().ensureWorkspaces()
    const refresh = vi.fn()
    window.addEventListener('workspace-access-refresh', refresh)
    localStorage.removeItem(storageKey)
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: null }))
    expect(store.getState().workspaces).toBeUndefined()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('从具体空间返回选择页刷新，默认入口内部跳转复用列表', async () => {
    store.getState().visitWorkspace('workspaces')
    await store.getState().ensureWorkspaces()
    store.getState().visitWorkspace('workspaces')
    await store.getState().ensureWorkspaces()
    expect(api.getWorkspaces).toHaveBeenCalledOnce()
    store.getState().visitWorkspace('company:company-one')
    store.getState().visitWorkspace('workspaces')
    await store.getState().ensureWorkspaces()
    expect(api.getWorkspaces).toHaveBeenCalledTimes(2)
  })
})
