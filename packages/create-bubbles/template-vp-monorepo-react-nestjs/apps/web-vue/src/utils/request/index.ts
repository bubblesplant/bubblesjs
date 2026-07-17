import { axiosRequestAdapter } from '@alova/adapter-axios'
import vueHook from 'alova/vue'
import { message } from 'antdv-next'

import { router } from '@/router'

import { envVariables } from '../env'
import { createDualCallInstance } from './core'

function getBaseConfig() {
  return {
    baseUrl: `/${envVariables.API_AFFIX}`,
    statusMap: {
      success: 200,
      unAuthorized: 401,
    },
    codeMap: {
      success: [200],
      unAuthorized: [401],
    },
    responseCodeKey: 'code',
    responseDataKey: 'data',
    responseMessageKey: 'msg',
    commonHeaders: () => ({}),
    isWrapped: true,
    isTransformResponse: true,
    successMessageFunc: (msg: string) => {
      message.success(msg)
    },
    errorMessageFunc: (msg: string) => {
      message.error(msg)
    },
    unAuthorizedResponseFunc: () => {
      router.push('/login')
      message.error('登录过期或未登录')
    },
    statesHook: vueHook,
    requestAdapter: axiosRequestAdapter(),
  }
}

const alovaRequest = createDualCallInstance(getBaseConfig())

export default alovaRequest
