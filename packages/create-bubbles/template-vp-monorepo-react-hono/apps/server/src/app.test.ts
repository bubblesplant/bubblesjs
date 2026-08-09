import { describe, expect, it } from 'vite-plus/test'
import { createApp } from './app.js'

describe('server app', () => {
  const app = createApp()

  it('returns liveness without connecting to infrastructure', async () => {
    const response = await app.request('/health/live')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      code: 200,
      data: {
        status: 'ok',
      },
      msg: '操作成功',
    })
  })

  it('uses the frontend-compatible response envelope', async () => {
    const response = await app.request('/')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      code: 200,
      data: {
        health: '/health/live',
      },
      msg: '操作成功',
    })
  })

  it('supports the production /api prefix without a rewrite proxy', async () => {
    const response = await app.request('/api/health/live')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      code: 200,
      data: {
        status: 'ok',
      },
    })
  })

  it('returns a wrapped 404 response', async () => {
    const response = await app.request('/missing')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      code: 404,
      data: null,
      msg: '接口不存在',
    })
  })
})
