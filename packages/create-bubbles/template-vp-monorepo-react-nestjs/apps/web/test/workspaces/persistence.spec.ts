// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vite-plus/test'
import type { WorkspacesResult } from 'shared/types'
import { api, data, deferred, seedSnapshot, storageKey, store, user } from './config'

describe('工作空间本地展示快照', () => {
  it('只保存版本、账号 ID、时间和空间展示字段，权限、令牌、账号资料不落盘', async () => {
    await store.getState().ensureWorkspaces()
    const snapshot = JSON.parse(localStorage.getItem(storageKey)!)
    expect(Object.keys(snapshot).sort()).toEqual(['savedAt', 'userId', 'version', 'workspaces'])
    expect(snapshot.workspaces).toEqual([
      { scope: { type: 'company', companyId: 'company-one' }, name: '演示企业' },
    ])
    expect(JSON.stringify(snapshot)).not.toMatch(
      /administrator|permissionKeys|session-one|demo_member/,
    )
  })

  it('核对账号后先恢复展示，多个消费者共享一次后台校验且默认分流等待最新数据', async () => {
    seedSnapshot()
    const response = deferred<WorkspacesResult>()
    api.getWorkspaces.mockReturnValueOnce(response.promise)
    const restored = await store.getState().ensureWorkspaces({ allowRestored: true })
    expect(restored.workspaces[0]?.name).toBe('演示企业')
    expect(restored.workspaces[0]?.administrator).toBeNull()
    expect(api.getWorkspaceUser).toHaveBeenCalledOnce()
    expect(store.getState()).toMatchObject({ status: 'restored', loading: true })
    let latestResolved = false
    const latest = store
      .getState()
      .ensureWorkspaces()
      .then((result) => {
        latestResolved = true
        return result
      })
    await Promise.resolve()
    expect(latestResolved).toBe(false)
    response.resolve({ ...data, workspaces: [] })
    await expect(latest).resolves.toMatchObject({ workspaces: [] })
    expect(api.getWorkspaces).toHaveBeenCalledOnce()
    expect(store.getState().status).toBe('ready')
  })

  it('账号不同的本地快照不会作为恢复态发布', async () => {
    seedSnapshot()
    const visitor = { ...user, id: 'user-two' }
    api.getWorkspaceUser.mockResolvedValueOnce(visitor)
    api.getWorkspaces.mockResolvedValueOnce({ user: visitor, workspaces: [] })
    const statuses: string[] = []
    const unsubscribe = store.subscribe(() => statuses.push(store.getState().status))
    await expect(store.getState().ensureWorkspaces({ allowRestored: true })).resolves.toMatchObject(
      {
        user: visitor,
        workspaces: [],
      },
    )
    expect(statuses).not.toContain('restored')
    unsubscribe()
  })

  it.each([
    '{invalid',
    JSON.stringify({ version: 99, userId: user.id, savedAt: Date.now(), workspaces: [] }),
    JSON.stringify({ version: 1, userId: user.id, savedAt: Date.now(), workspaces: [null] }),
  ])('缓存损坏或版本不兼容时正常联网：%s', async (raw) => {
    localStorage.setItem(storageKey, raw)
    await expect(store.getState().ensureWorkspaces()).resolves.toEqual(data)
    expect(api.getWorkspaceUser).not.toHaveBeenCalled()
    expect(api.getWorkspaces).toHaveBeenCalledOnce()
  })

  it('禁止读取或写入 localStorage 时继续使用内存和网络', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    await expect(store.getState().ensureWorkspaces()).resolves.toEqual(data)
    expect(store.getState().status).toBe('ready')
  })

  it('后台校验失败清除旧展示并保存错误，重试可恢复', async () => {
    seedSnapshot()
    const response = deferred<WorkspacesResult>()
    api.getWorkspaces.mockReturnValueOnce(response.promise)
    await store.getState().ensureWorkspaces({ allowRestored: true })
    const latest = store.getState().ensureWorkspaces()
    const error = new Error('网络不可用')
    const rejected = expect(latest).rejects.toBe(error)
    response.reject(error)
    await rejected
    expect(store.getState()).toMatchObject({
      status: 'error',
      error,
      workspaces: undefined,
    })
    await expect(store.getState().ensureWorkspaces()).resolves.toEqual(data)
  })
})
