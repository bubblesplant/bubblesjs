import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from '../src/index'

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

function getResponded(option: Parameters<typeof createInstance>[0] = {}) {
  return createInstance(option).config.responded
}

describe('response handling', () => {
  beforeEach(() => {
    mocks.createAlova.mockClear()
  })

  it('transforms a fetch Response into business data', async () => {
    const successMessageFunc = vi.fn()
    const { onSuccess } = getResponded({
      isShowSuccessMessage: true,
      successMessageFunc,
    })

    const response = new Response(
      JSON.stringify({
        code: 200,
        data: { id: 1 },
        message: 'ok',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )

    await expect(onSuccess(response, { config: { meta: {} } } as any)).resolves.toEqual({ id: 1 })
    expect(successMessageFunc).toHaveBeenCalledWith('ok')
  })

  it('transforms an axios-shaped response', async () => {
    const { onSuccess } = getResponded()
    const response = {
      status: 200,
      data: {
        code: 200,
        data: [{ id: 1 }],
        message: 'loaded',
      },
      headers: {},
      config: {},
    }

    await expect(onSuccess(response, undefined as any)).resolves.toEqual([{ id: 1 }])
  })

  it('transforms a taro-shaped response', async () => {
    const { onSuccess } = getResponded({
      responseMessageKey: 'msg',
    })
    const response = {
      statusCode: 200,
      data: {
        code: 200,
        data: { ok: true },
        msg: 'done',
      },
      header: {},
    }

    await expect(onSuccess(response as any, undefined as any)).resolves.toEqual({ ok: true })
  })

  it('parses string data from taro upload style responses', async () => {
    const { onSuccess } = getResponded({
      responseMessageKey: 'msg',
    })
    const response = {
      statusCode: 200,
      data: JSON.stringify({
        code: 200,
        data: { url: '/file.png' },
        msg: 'uploaded',
      }),
    }

    await expect(onSuccess(response as any, undefined as any)).resolves.toEqual({ url: '/file.png' })
  })

  it('can return unwrapped data', async () => {
    const { onSuccess } = getResponded({
      isWrapped: false,
    })
    const response = {
      status: 200,
      data: {
        id: 1,
        name: 'Tom',
      },
    }

    await expect(onSuccess(response as any, undefined as any)).resolves.toEqual({
      id: 1,
      name: 'Tom',
    })
  })

  it('allows meta to bypass transform for one request', async () => {
    const { onSuccess } = getResponded()
    const response = {
      status: 200,
      data: {
        code: 200,
        data: { id: 1 },
      },
    }

    await expect(
      onSuccess(response as any, {
        config: {
          meta: {
            isTransformResponse: false,
          },
        },
      } as any),
    ).resolves.toBe(response)
  })

  it('handles unauthorized http status', async () => {
    const errorMessageFunc = vi.fn()
    const unAuthorizedResponseFunc = vi.fn()
    const { onSuccess } = getResponded({
      errorMessageFunc,
      unAuthorizedResponseFunc,
    })
    const response = {
      status: 401,
      data: {
        message: 'login required',
      },
    }

    await expect(onSuccess(response as any, undefined as any)).rejects.toBe(response)
    expect(unAuthorizedResponseFunc).toHaveBeenCalledTimes(1)
    expect(errorMessageFunc).toHaveBeenCalledWith('login required')
  })

  it('handles custom business code keys', async () => {
    const errorMessageFunc = vi.fn()
    const unAuthorizedResponseFunc = vi.fn()
    const { onSuccess } = getResponded({
      responseCodeKey: 'status',
      responseMessageKey: 'msg',
      codeMap: {
        success: [0],
        unAuthorized: [401],
      },
      errorMessageFunc,
      unAuthorizedResponseFunc,
    })
    const response = {
      status: 200,
      data: {
        status: 401,
        msg: 'expired',
      },
    }

    await expect(onSuccess(response as any, undefined as any)).rejects.toBe(response)
    expect(unAuthorizedResponseFunc).toHaveBeenCalledTimes(1)
    expect(errorMessageFunc).toHaveBeenCalledWith('expired')
  })

  it('respects onError message meta override', async () => {
    const errorMessageFunc = vi.fn()
    const { onError } = getResponded({
      errorMessageFunc,
    })
    const error = new Error('network error')

    await expect(
      onError(error, {
        config: {
          meta: {
            isShowErrorMessage: false,
          },
        },
      } as any),
    ).rejects.toThrow('network error')
    expect(errorMessageFunc).not.toHaveBeenCalled()
  })
})
