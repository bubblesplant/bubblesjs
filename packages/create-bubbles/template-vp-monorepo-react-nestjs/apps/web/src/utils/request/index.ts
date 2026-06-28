import { axiosRequestAdapter, type AlovaAxiosRequestConfig } from '@alova/adapter-axios'
import reactHook, { type ReactHookExportType } from 'alova/react'
import { message } from 'antd'
import type { AxiosResponse, AxiosResponseHeaders } from 'axios'
import { navigator } from '@/router'
import { envVariables } from '@/utils/env'
import { createDualCallInstance, type BaseRequestOption } from './core/index.ts'

type WebRequestOption = BaseRequestOption<
  AlovaAxiosRequestConfig,
  AxiosResponse,
  AxiosResponseHeaders,
  ReactHookExportType<unknown>
>

function normalizeBaseUrl(apiAffix?: string) {
  if (!apiAffix) return '/'
  if (/^https?:\/\//.test(apiAffix) || apiAffix.startsWith('/')) {
    return apiAffix
  }

  return `/${apiAffix}`
}

function getBaseConfig(): WebRequestOption {
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
      void navigator('/login')
      message.error('登录过期或未登录')
    },
    statesHook: reactHook,
    requestAdapter: axiosRequestAdapter(),
  }
}

const alovaRequest = createDualCallInstance<
  AlovaAxiosRequestConfig,
  AxiosResponse,
  AxiosResponseHeaders,
  ReactHookExportType<unknown>
>(getBaseConfig())

export default alovaRequest
