import { describe, expect, it } from 'vite-plus/test'
import { getRequestErrorMessage } from '../src/utils/request-error'

describe('请求失败文案', () => {
  it('优先读取服务端公开消息并保持原始异常', () => {
    const error = Object.assign(new Error('Request failed with status code 409'), {
      code: 'ERR_BAD_REQUEST',
      response: { status: 409, data: { code: 'ACCESS.VERSION_CONFLICT', message: '数据已更新' } },
    })

    expect(getRequestErrorMessage(error, '操作失败')).toBe('数据已更新')
    expect(error.message).toBe('Request failed with status code 409')
    expect(error.code).toBe('ERR_BAD_REQUEST')
  })

  it('网络失败和普通异常保留已有消息', () => {
    expect(getRequestErrorMessage(new Error('Network Error'), '操作失败')).toBe('Network Error')
    expect(getRequestErrorMessage(new Error('请选择一条记录'), '操作失败')).toBe('请选择一条记录')
  })

  it.each([null, undefined, '失败', { response: null }, { response: { data: { message: 123 } } }])(
    '缺少有效消息时采用调用方兜底：%j',
    (error) => {
      expect(getRequestErrorMessage(error, '加载失败，请重试')).toBe('加载失败，请重试')
    },
  )

  it('非法或空的服务端消息不会遮盖客户端异常', () => {
    const error = Object.assign(new Error('HTTP 500'), { response: { data: { message: '' } } })
    expect(getRequestErrorMessage(error, '加载失败')).toBe('HTTP 500')
  })
})
