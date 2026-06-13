import type { FetchRequestInit } from 'alova/fetch'
import { message } from 'antd'
import { apiAffix, apiUrl, uploadApiAffix } from '@/utils/env'
import { createInstance } from './core'

export const moduleUrl = {
  LJSD: 'bee/single-track',
}

const alovaRequest = createInstance<FetchRequestInit, Response, Headers>({
  baseUrl: `${apiUrl}/${apiAffix}`,
  statusMap: { success: 200, unAuthorized: 401 },
  codeMap: { success: [200] },
  responseDataKey: 'data',
  responseMessageKey: 'msg',
  commonHeaders: () => ({}),
  successMessageFunc: (msg) => {
    message.success(msg)
  },
  errorMessageFunc: (msg) => {
    message.error(msg)
  },
  unAuthorizedResponseFunc: () => {
    message.warning('登录过期或未登录')
    window.location.href = '/login'
  },
})

export default alovaRequest

export const alovaUploadRequest = createInstance<FetchRequestInit, Response, Headers>({
  baseUrl: `${apiUrl}/${uploadApiAffix}`,
  statusMap: { success: 200, unAuthorized: 401 },
  codeMap: { success: [200] },
  responseDataKey: 'data',
  responseMessageKey: 'msg',
  commonHeaders: () => ({}),
  successMessageFunc: (msg) => {
    message.success(msg)
  },
  errorMessageFunc: (msg) => {
    message.error(msg)
  },
  unAuthorizedResponseFunc: () => {
    message.warning('登录过期或未登录')
    window.location.href = '/login'
  },
})
