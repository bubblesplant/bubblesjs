import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDualCallInstance, createInstance } from '../src/index'
import type { BaseRequestOption } from '../src/index'

const mocks = vi.hoisted(() => {
  const createMockInstance = (config: any) => ({
    config,
    Get: vi.fn(),
    Post: vi.fn(),
    Put: vi.fn(),
    Delete: vi.fn(),
    Patch: vi.fn(),
    Head: vi.fn(),
    Options: vi.fn(),
    Request: vi.fn(),
  })

  return {
    createAlova: vi.fn((config: any) => createMockInstance(config)),
    adapterFetch: vi.fn(() => 'fetch-adapter'),
  }
})

vi.mock('alova', () => ({
  createAlova: mocks.createAlova,
}))

vi.mock('alova/fetch', () => ({
  default: mocks.adapterFetch,
}))

describe('request core factory', () => {
  beforeEach(() => {
    mocks.createAlova.mockClear()
  })

  it('creates a default alova instance backed by fetch adapter', () => {
    const instance = createInstance()

    expect(instance.Get).toBeDefined()
    expect(mocks.createAlova).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: '/',
        requestAdapter: 'fetch-adapter',
      }),
    )
  })

  it('accepts project-level adapter, statesHook and storage adapter', () => {
    const requestAdapter = {} as NonNullable<BaseRequestOption['requestAdapter']>
    const statesHook = {} as NonNullable<BaseRequestOption['statesHook']>
    const storageAdapter = {} as NonNullable<BaseRequestOption['storageAdapter']>

    const instance = createInstance({
      baseUrl: '/custom',
      requestAdapter,
      statesHook,
      storageAdapter,
    })

    expect(instance.config).toEqual(
      expect.objectContaining({
        baseURL: '/custom',
        requestAdapter,
        statesHook,
        l2Cache: storageAdapter,
      }),
    )
  })

  it('applies static and dynamic common headers before request', async () => {
    const instance = createInstance({
      commonHeaders: {
        Authorization: () => 'Bearer token',
        'X-App': 'bubbles',
        'X-Skip': undefined,
      },
    })

    const method = { config: { headers: {} as Record<string, string> } }
    await instance.config.beforeRequest(method)

    expect(method.config.headers).toEqual({
      Authorization: 'Bearer token',
      'X-App': 'bubbles',
    })
  })

  it('creates a dual-call instance and binds default http methods', () => {
    const request = createDualCallInstance({ baseUrl: '/api' })
    const defaultInstance = request()
    const customInstance = request({ baseUrl: '/other', isShowErrorMessage: false })

    expect(typeof request).toBe('function')
    expect(defaultInstance).toBe(request())
    expect(customInstance).not.toBe(defaultInstance)

    request.Get('/users')
    request.Post('/users', { name: 'Tom' })

    expect(defaultInstance.Get).toHaveBeenCalledWith('/users')
    expect(defaultInstance.Post).toHaveBeenCalledWith('/users', { name: 'Tom' })
  })
})
