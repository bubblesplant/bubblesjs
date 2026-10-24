import type { AxiosResponse } from 'axios'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const effects = vi.hoisted(() => ({
  unauthorized: vi.fn(),
  errorMessage: vi.fn(),
  token: vi.fn(() => 'test-session'),
}))
vi.mock('../src/utils/env', () => ({ envVariables: { API_AFFIX: '' } }))
vi.mock('../src/utils/storage/cookie', () => ({ cookie: { get: effects.token } }))
vi.mock('../src/utils/request/utils', () => ({ unAuthorizedResponseFunc: effects.unauthorized }))
vi.mock('antd', () => ({ message: { error: effects.errorMessage } }))

import { alovaRequest } from '../src/utils/request'
import { createAlovaInstanceFactory } from '../src/utils/request/core'
import { createRequestServer } from './request/fixtures'

const fixture = createRequestServer()

beforeAll(async () => {
  await fixture.start()
  alovaRequest.options.baseURL = fixture.baseURL
})

afterAll(() => fixture.close())

beforeEach(() => {
  vi.clearAllMocks()
  effects.token.mockReturnValue('test-session')
})

describe('原生 Axios 请求工厂', () => {
  it('默认保留 AxiosResponse，允许使用原生 beforeRequest 设置请求头', async () => {
    const request = createAlovaInstanceFactory({
      baseURL: fixture.baseURL,
      beforeRequest(method) {
        method.config.headers.Authorization = 'Bearer factory-session'
      },
    })

    const response = await request.Get<AxiosResponse>('/me')
    expect(response.status).toBe(200)
    expect(response.data).toEqual({ id: 'test-user', authorization: 'Bearer factory-session' })
  })

  it('保留原生 AxiosError，服务端业务码不覆盖 Axios 错误码', async () => {
    const request = createAlovaInstanceFactory({ baseURL: fixture.baseURL })
    await expect(request.Post('/credentials').send()).rejects.toMatchObject({
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      response: {
        status: 422,
        data: { code: 'AUTH.INVALID_CREDENTIALS', message: '账号或密码错误' },
      },
    })
    expect(effects.errorMessage).not.toHaveBeenCalled()
    expect(effects.unauthorized).not.toHaveBeenCalled()
  })
})

describe('通用请求拦截器', () => {
  it('默认提取响应体，并在每次发送时读取当前令牌', async () => {
    expect(await alovaRequest.Get('/me')).toEqual({
      id: 'test-user',
      authorization: 'Bearer test-session',
    })

    effects.token.mockReturnValue('next-session')
    expect(await alovaRequest.Get('/me')).toEqual({
      id: 'test-user',
      authorization: 'Bearer next-session',
    })
  })

  it('元数据可以保留完整 AxiosResponse', async () => {
    const response = await alovaRequest.Get<AxiosResponse<{ id: string }>>('/me', {
      meta: { isTransformResponse: true },
    })
    expect(response.status).toBe(200)
    expect(response.data.id).toBe('test-user')
    expect(response.headers['content-type']).toContain('application/json')
  })

  it('transform 接收正文或显式保留的完整响应', async () => {
    const body = await alovaRequest.Get<string, { id: string }>('/me', {
      transform: (data) => data.id,
    })
    const status = await alovaRequest.Get<number, AxiosResponse>('/me', {
      meta: { isTransformResponse: true },
      transform: (response) => response.status,
    })
    expect(body).toBe('test-user')
    expect(status).toBe(200)
  })

  it.each([201, 202, 204, 206])('HTTP %i 按 Axios 的 2xx 规则返回成功', async (status) => {
    await expect(alovaRequest.Get(`/http-status/${status}`).send()).resolves.toEqual(
      status === 204 ? '' : { status },
    )
    expect(effects.errorMessage).not.toHaveBeenCalled()
    expect(effects.unauthorized).not.toHaveBeenCalled()
  })

  it('422 提示服务端消息，拒绝值仍保留原始 AxiosError 结构', async () => {
    await expect(alovaRequest.Post('/credentials').send()).rejects.toMatchObject({
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 422',
      response: {
        status: 422,
        data: { code: 'AUTH.INVALID_CREDENTIALS', message: '账号或密码错误' },
      },
    })
    expect(effects.errorMessage).toHaveBeenCalledExactlyOnceWith('账号或密码错误')
    expect(effects.unauthorized).not.toHaveBeenCalled()
  })

  it('单次请求可关闭普通失败提示', async () => {
    await expect(
      alovaRequest.Post('/credentials', undefined, { meta: { isShowErrorMessage: false } }).send(),
    ).rejects.toMatchObject({ response: { status: 422 } })
    expect(effects.errorMessage).not.toHaveBeenCalled()
  })

  it('关闭全局提示后，HTTP 401 仍调用统一会话失效处理', async () => {
    await expect(
      alovaRequest.Get('/expired', { meta: { isShowErrorMessage: false } }).send(),
    ).rejects.toMatchObject({
      isAxiosError: true,
      response: { status: 401, data: { code: 'AUTH.SESSION_INVALID' } },
    })
    expect(effects.unauthorized).toHaveBeenCalledOnce()
    expect(effects.errorMessage).not.toHaveBeenCalled()
  })

  it('503 保留会话，并显示服务端公开文案', async () => {
    await expect(alovaRequest.Get('/unavailable').send()).rejects.toMatchObject({
      response: { status: 503 },
    })
    expect(effects.errorMessage).toHaveBeenCalledExactlyOnceWith('登录服务暂时不可用，请稍后重试')
    expect(effects.unauthorized).not.toHaveBeenCalled()
  })

  it('缺少字符串消息时使用统一失败提示', async () => {
    await expect(alovaRequest.Get('/http-status/500').send()).rejects.toMatchObject({
      response: { status: 500 },
    })
    expect(effects.errorMessage).toHaveBeenCalledExactlyOnceWith('请求失败')
  })
})
