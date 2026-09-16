import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

vi.mock('../src/utils/request/index', () => ({ default: () => ({}) }))
const cookieMocks = vi.hoisted(() => ({ get: vi.fn(() => 'session-one'), remove: vi.fn() }))
vi.mock('../src/utils/storage/cookie', () => ({ cookie: cookieMocks }))

import {
  clearWorkspaceRequests,
  enterWorkspace,
  runWorkspaceRequest,
} from '../src/utils/request/workspace'

const dispatchEvent = vi.fn()
const assign = vi.fn()

/** 创建可手动完成或拒绝的请求替身，用于验证取消与迟到响应。 */
function deferredMethod<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { method: { send: () => promise, abort: vi.fn() }, resolve, reject }
}

beforeEach(() => {
  clearWorkspaceRequests()
  vi.clearAllMocks()
  cookieMocks.get.mockReturnValue('session-one')
  vi.stubGlobal('window', { dispatchEvent, location: { assign } })
})

describe('工作空间请求隔离', () => {
  it('切换空间取消旧请求，即使服务端迟到成功也不返回旧数据', async () => {
    enterWorkspace('company:a')
    const pending = deferredMethod<string>()
    const result = runWorkspaceRequest({ method: pending.method, workspaceKey: 'company:a' })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    enterWorkspace('company:b')
    pending.resolve('企业 A 的数据')
    await rejected
    expect(pending.method.abort).toHaveBeenCalledOnce()
  })

  it('重复进入同一空间不会中止该空间的在途请求', async () => {
    enterWorkspace('company:a')
    const pending = deferredMethod<string>()
    const result = runWorkspaceRequest({ method: pending.method, workspaceKey: 'company:a' })

    enterWorkspace('company:a')
    expect(pending.method.abort).not.toHaveBeenCalled()

    pending.resolve('企业 A 的数据')
    await expect(result).resolves.toBe('企业 A 的数据')
  })

  it('连续切换 A、B、C 时前两个空间失效，当前空间仍可正常完成', async () => {
    enterWorkspace('company:a')
    const companyA = deferredMethod<string>()
    const resultA = runWorkspaceRequest({ method: companyA.method, workspaceKey: 'company:a' })
    const rejectedA = expect(resultA).rejects.toMatchObject({ name: 'AbortError' })

    enterWorkspace('company:b')
    const companyB = deferredMethod<string>()
    const resultB = runWorkspaceRequest({ method: companyB.method, workspaceKey: 'company:b' })
    const rejectedB = expect(resultB).rejects.toMatchObject({ name: 'AbortError' })

    enterWorkspace('company:c')
    const currentMethod = {
      send: vi.fn(() => Promise.resolve('企业 C 的数据')),
      abort: vi.fn(),
    }
    await expect(
      runWorkspaceRequest({ method: currentMethod, workspaceKey: 'company:c' }),
    ).resolves.toBe('企业 C 的数据')

    companyA.resolve('企业 A 的迟到数据')
    companyB.resolve('企业 B 的迟到数据')
    await Promise.all([rejectedA, rejectedB])
    expect(companyA.method.abort).toHaveBeenCalledOnce()
    expect(companyB.method.abort).toHaveBeenCalledOnce()
    expect(currentMethod.abort).not.toHaveBeenCalled()
  })

  it('旧账号迟到的 401 不能删除新账号 Cookie 或触发跳转', async () => {
    enterWorkspace('company:a')
    const pending = deferredMethod<string>()
    const result = runWorkspaceRequest({ method: pending.method, workspaceKey: 'company:a' })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    cookieMocks.get.mockReturnValue('session-two')
    enterWorkspace('company:a')
    pending.reject(Object.assign(new Error('旧会话失效'), { status: 401 }))
    await rejected
    expect(cookieMocks.remove).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('旧作用域迟到的 403 不刷新新空间权限', async () => {
    enterWorkspace('company:a')
    const pending = deferredMethod<string>()
    const result = runWorkspaceRequest({ method: pending.method, workspaceKey: 'company:a' })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    enterWorkspace('company:b')
    pending.reject(Object.assign(new Error('无权限'), { status: 403 }))
    await rejected
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('当前业务请求 403 触发权限刷新，access 请求失败不递归刷新', async () => {
    enterWorkspace('platform')
    const error = Object.assign(new Error('无权限'), { status: 403 })
    await expect(
      runWorkspaceRequest({
        method: { send: () => Promise.reject(error), abort: vi.fn() },
        workspaceKey: 'platform',
      }),
    ).rejects.toBe(error)
    expect(dispatchEvent).toHaveBeenCalledOnce()
    dispatchEvent.mockClear()
    await expect(
      runWorkspaceRequest({
        method: { send: () => Promise.reject(error), abort: vi.fn() },
        workspaceKey: 'platform',
        accessRequest: true,
      }),
    ).rejects.toBe(error)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('当前空间的 401 会清理登录令牌并跳转登录页', async () => {
    enterWorkspace('platform')
    const error = Object.assign(new Error('登录已失效'), { status: 401 })

    await expect(
      runWorkspaceRequest({
        method: { send: () => Promise.reject(error), abort: vi.fn() },
        workspaceKey: 'platform',
      }),
    ).rejects.toBe(error)

    expect(cookieMocks.remove).toHaveBeenCalledWith('token')
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('Router AbortSignal 取消后拒绝迟到结果', async () => {
    enterWorkspace('project:a:p')
    const controller = new AbortController()
    const pending = deferredMethod<string>()
    const result = runWorkspaceRequest({
      method: pending.method,
      workspaceKey: 'project:a:p',
      signal: controller.signal,
    })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    pending.resolve('迟到结果')
    await rejected
    expect(pending.method.abort).toHaveBeenCalledOnce()
  })

  it('绑定旧空间的请求不能在新空间代次中借用 generation 发出', async () => {
    enterWorkspace('company:a')
    enterWorkspace('company:b')
    const method = { send: vi.fn(() => Promise.resolve('不应发送')), abort: vi.fn() }

    await expect(runWorkspaceRequest({ method, workspaceKey: 'company:a' })).rejects.toMatchObject({
      name: 'AbortError',
    })

    expect(method.send).not.toHaveBeenCalled()
    expect(method.abort).not.toHaveBeenCalled()
  })
})
