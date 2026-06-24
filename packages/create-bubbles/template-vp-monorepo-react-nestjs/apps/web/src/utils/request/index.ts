import { axiosRequestAdapter } from '@alova/adapter-axios'
import reactHook from 'alova/react'
import { message } from 'antd'
import { navigator } from '@/router'
import { envVariables } from '@/utils/env'
import { createDualCallInstance } from './core/index.ts'

function normalizeBaseUrl(apiAffix?: string) {
  if (!apiAffix) return '/'
  if (/^https?:\/\//.test(apiAffix) || apiAffix.startsWith('/')) {
    return apiAffix
  }

  return `/${apiAffix}`
}

function getBaseConfig(): Parameters<typeof createDualCallInstance>[0] {
  return {
    baseUrl: normalizeBaseUrl(envVariables.API_AFFIX),
    statusMap: {
      success: [200, 201, 204],
      unAuthorized: 401,
    },
    codeMap: {
      success: [200],
      unAuthorized: [401],
    },
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
      navigator('/login')
      message.error('登录过期或未登录')
    },
    statesHook: reactHook,
    requestAdapter: axiosRequestAdapter(),
  }
}

const alovaRequest = createDualCallInstance(getBaseConfig())

export default alovaRequest
