import { axiosRequestAdapter } from '@alova/adapter-axios'
import vueHook from 'alova/vue'
import { message } from 'antdv-next'

import { router } from '@/router'

import { envVariables } from '../env'
import { createDualCallInstance } from './core'

import 'element-plus/es/components/message/style/css'

function getBaseConfig(): Parameters<typeof createDualCallInstance>[0] {
  return {
    baseUrl: `/${envVariables.API_AFFIX}`,
    statusMap: {
      success: 200,
      unAuthorized: 401,
    },
    codeMap: {
      success: [200],
    },
    responseDataKey: 'data',
    responseMessageKey: 'msg',
    commonHeaders: {},
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
