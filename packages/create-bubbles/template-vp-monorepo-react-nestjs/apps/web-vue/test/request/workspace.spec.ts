import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { unAuthorizedResponseFunc } from '@/utils/request/utils'
import {
  clearWorkspaceRequests,
  enterWorkspace,
  runSessionRequest,
  runWorkspaceRequest,
} from '@/utils/request/workspace'
import { cookie } from '@/utils/storage/cookie'

vi.mock('@/utils/request/core', () => ({
  createAlovaInstanceFactory: vi.fn((options) => ({ options })),
}))
vi.mock('@/utils/request/index', () => ({ alovaRequest: { options: { responded: {} } } }))
vi.mock('@/utils/request/utils', () => ({ unAuthorizedResponseFunc: vi.fn() }))

/** 手动控制返回次序，模拟网络无法及时中止时的迟到响应。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { resolve, reject, method: { send: vi.fn(() => promise), abort: vi.fn() } }
}
/** 构造只用于状态判断的 Axios 异常。 */
function httpError(status: number) {
  return new AxiosError('mock error', undefined, undefined, undefined, {
    status,
    data: {},
    headers: {},
    config: {},
  } as never)
}
beforeEach(() => {
  clearWorkspaceRequests()
  cookie.set('token', 'fictional-test-session')
  enterWorkspace('platform')
})
describe('空间请求隔离', () => {
  it('返回当前空间数据，并禁用底层缓存', async () => {
    const request = deferred<string>()
    const promise = runWorkspaceRequest({ method: request.method, workspaceKey: 'platform' })
    request.resolve('current')
    await expect(promise).resolves.toBe('current')
    expect(request.method.send).toHaveBeenCalledWith(true)
  })
  it('切换空间中止请求，即使仍返回数据也不能回写', async () => {
    const request = deferred<string>()
    const promise = runWorkspaceRequest({ method: request.method, workspaceKey: 'platform' })
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    enterWorkspace('company:demo')
    expect(request.method.abort).toHaveBeenCalledOnce()
    request.resolve('old')
    await assertion
  })
  it('旧空间 401 不清除新会话', async () => {
    const request = deferred<string>()
    const promise = runWorkspaceRequest({ method: request.method, workspaceKey: 'platform' })
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    enterWorkspace('company:demo')
    request.reject(httpError(401))
    await assertion
    expect(unAuthorizedResponseFunc).not.toHaveBeenCalled()
  })
  it('当前空间 401 执行会话失效处理', async () => {
    await expect(
      runWorkspaceRequest({
        method: { send: vi.fn().mockRejectedValue(httpError(401)), abort: vi.fn() },
        workspaceKey: 'platform',
      }),
    ).rejects.toBeInstanceOf(AxiosError)
    expect(unAuthorizedResponseFunc).toHaveBeenCalledOnce()
  })
  it('已取消请求不发送，发送中的取消会中止底层方法', async () => {
    const request = deferred<string>()
    const controller = new AbortController()
    controller.abort()
    await expect(
      runWorkspaceRequest({
        method: request.method,
        workspaceKey: 'platform',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(request.method.send).not.toHaveBeenCalled()
    const next = new AbortController()
    const promise = runWorkspaceRequest({
      method: request.method,
      workspaceKey: 'platform',
      signal: next.signal,
    })
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    next.abort()
    expect(request.method.abort).toHaveBeenCalledOnce()
    request.resolve('late')
    await assertion
  })
  it('当前业务请求 403 刷新授权，授权接口自身 403 不触发循环', async () => {
    const listener = vi.fn()
    window.addEventListener('workspace-access-refresh', listener)
    try {
      const method = { send: vi.fn().mockRejectedValue(httpError(403)), abort: vi.fn() }
      await expect(
        runWorkspaceRequest({ method, workspaceKey: 'platform' }),
      ).rejects.toBeInstanceOf(AxiosError)
      await expect(
        runWorkspaceRequest({ method, workspaceKey: 'platform', accessRequest: true }),
      ).rejects.toBeInstanceOf(AxiosError)
      expect(listener).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('workspace-access-refresh', listener)
    }
  })
  it('同一会话空间列表可跨空间完成，换账号则丢弃', async () => {
    const request = deferred<string>()
    const promise = runSessionRequest({ method: request.method })
    enterWorkspace('company:demo')
    request.resolve('spaces')
    await expect(promise).resolves.toBe('spaces')
    const old = deferred<string>()
    const pending = runSessionRequest({ method: old.method })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    cookie.set('token', 'another-fictional-session')
    old.resolve('old spaces')
    await assertion
  })
})
