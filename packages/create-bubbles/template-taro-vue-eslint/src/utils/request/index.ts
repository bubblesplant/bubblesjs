import type { TaroConfig } from '@alova/adapter-taro'
import type { VueHookExportType } from 'alova/vue'
import AdapterTaroVue from '@alova/adapter-taro/vue'
import Taro from '@tarojs/taro'
import { envVar } from '@/utils/env'
import { createInstance } from './core'

type TaroResponse
  = | Taro.request.SuccessCallbackResult<any>
    | Taro.uploadFile.SuccessCallbackResult
    | Taro.downloadFile.FileSuccessCallbackResult

type TaroResponseHeader = Taro.request.SuccessCallbackResult<any>['header']

const taroAdapter = AdapterTaroVue()

const alovaRequest = createInstance<
  TaroConfig,
  TaroResponse,
  TaroResponseHeader,
  VueHookExportType<unknown>
>({
  baseUrl: `${envVar.apiApi}`,
  statusMap: { success: 200, unAuthorized: 401 },
  codeMap: { success: [200] },
  responseDataKey: 'data',
  responseMessageKey: 'msg',
  commonHeaders: {},
  successMessageFunc: (msg) => {
    Taro.showToast({ title: msg })
  },
  errorMessageFunc: (msg) => {
    Taro.showToast({ title: msg, icon: 'error' })
  },
  unAuthorizedResponseFunc: () => {
    Taro.showToast({ title: '登录过期或未登录' })
    Taro.navigateTo({ url: '/pages/login/index' })
  },
  statesHook: taroAdapter.statesHook,
  requestAdapter: taroAdapter.requestAdapter,
  storageAdapter: taroAdapter.storageAdapter,
})

export default alovaRequest
