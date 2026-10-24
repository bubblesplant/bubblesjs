import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const effects = vi.hoisted(() => ({
  unauthorized: vi.fn(),
  errorMessage: vi.fn(),
  token: vi.fn(() => 'session-one'),
  removeToken: vi.fn(),
  dispatchEvent: vi.fn(),
}))
vi.mock('../../src/utils/env', () => ({ envVariables: { API_AFFIX: '' } }))
vi.mock('../../src/utils/storage/cookie', () => ({
  cookie: { get: effects.token, remove: effects.removeToken },
}))
vi.mock('../../src/utils/request/utils', () => ({ unAuthorizedResponseFunc: effects.unauthorized }))
vi.mock('antd', () => ({ message: { error: effects.errorMessage } }))

import {
  clearWorkspaceRequests,
  enterWorkspace,
  freshRequest,
  runSessionRequest,
  runWorkspaceRequest,
  workspaceRequest,
} from '../../src/utils/request/workspace'
import { createRequestServer } from './fixtures'

const fixture = createRequestServer()

beforeAll(async () => {
  await fixture.start()
  workspaceRequest.options.baseURL = fixture.baseURL
})

afterAll(() => fixture.close())

beforeEach(() => {
  clearWorkspaceRequests()
  vi.clearAllMocks()
  effects.token.mockReturnValue('session-one')
  vi.stubGlobal('window', { dispatchEvent: effects.dispatchEvent })
})

describe('工作空间真实拦截器链路', () => {
  it('复用通用成功响应与鉴权配置，返回业务正文', async () => {
    enterWorkspace('platform')
    await expect(
      runWorkspaceRequest({
        method: workspaceRequest.Get('/me', freshRequest),
        workspaceKey: 'platform',
      }),
    ).resolves.toEqual({ id: 'test-user', authorization: 'Bearer session-one' })
  })

  it('当前空间真实 HTTP 401 交给统一登录处理，不重复清令牌或提示', async () => {
    enterWorkspace('platform')
    await expect(
      runWorkspaceRequest({
        method: workspaceRequest.Get('/expired', freshRequest),
        workspaceKey: 'platform',
      }),
    ).rejects.toMatchObject({ isAxiosError: true, response: { status: 401 } })
    expect(effects.removeToken).not.toHaveBeenCalled()
    expect(effects.unauthorized).toHaveBeenCalledOnce()
    expect(effects.errorMessage).not.toHaveBeenCalled()
  })

  it('中止来不及时，旧账号真实 HTTP 401 仍在全局登录副作用前被丢弃', async () => {
    enterWorkspace('company:a')
    const responseReady = fixture.waitForResponse('/late-401')
    const method = workspaceRequest.Get('/late-401', freshRequest)
    const abort = vi.spyOn(method, 'abort').mockResolvedValue(undefined)
    const result = runWorkspaceRequest({ method, workspaceKey: 'company:a' })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    const response = await responseReady

    effects.token.mockReturnValue('session-two')
    enterWorkspace('company:a')
    response.writeHead(401).end(JSON.stringify({ message: '旧会话失效' }))
    await rejected

    expect(abort).toHaveBeenCalledOnce()
    expect(effects.removeToken).not.toHaveBeenCalled()
    expect(effects.unauthorized).not.toHaveBeenCalled()
    expect(effects.errorMessage).not.toHaveBeenCalled()
  })

  it('空间切换后的真实 HTTP 403 不刷新新空间权限或提示旧错误', async () => {
    enterWorkspace('company:a')
    const responseReady = fixture.waitForResponse('/late-403')
    const method = workspaceRequest.Get('/late-403', freshRequest)
    vi.spyOn(method, 'abort').mockResolvedValue(undefined)
    const result = runWorkspaceRequest({ method, workspaceKey: 'company:a' })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    const response = await responseReady

    enterWorkspace('company:b')
    response.writeHead(403).end(JSON.stringify({ message: '旧空间无权限' }))
    await rejected

    expect(effects.dispatchEvent).not.toHaveBeenCalled()
    expect(effects.errorMessage).not.toHaveBeenCalled()
  })

  it('当前业务真实 HTTP 403 触发权限刷新，并继续抛出原生异常', async () => {
    enterWorkspace('platform')
    await expect(
      runWorkspaceRequest({
        method: workspaceRequest.Get('/http-status/403', freshRequest),
        workspaceKey: 'platform',
      }),
    ).rejects.toMatchObject({ isAxiosError: true, response: { status: 403 } })
    expect(effects.dispatchEvent).toHaveBeenCalledOnce()
    expect(effects.dispatchEvent.mock.calls[0]?.[0]).toHaveProperty(
      'type',
      'workspace-access-refresh',
    )
    expect(effects.errorMessage).not.toHaveBeenCalled()
  })

  it('会话级真实请求换号后的迟到 401 不触发登录处理', async () => {
    const responseReady = fixture.waitForResponse('/late-session-401')
    const method = workspaceRequest.Get('/late-session-401', freshRequest)
    const result = runSessionRequest({ method })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    const response = await responseReady

    effects.token.mockReturnValue('session-two')
    response.writeHead(401).end(JSON.stringify({ message: '旧会话失效' }))
    await rejected

    expect(effects.removeToken).not.toHaveBeenCalled()
    expect(effects.unauthorized).not.toHaveBeenCalled()
    expect(effects.errorMessage).not.toHaveBeenCalled()
  })
})
