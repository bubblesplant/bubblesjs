import Taro from "@tarojs/taro";
import { API_URL } from "../env";
import { createInstance } from "./core";
import AdapterTaro from '@alova/adapter-taro'

const taroAdapter = AdapterTaro()

const alovaRequest = createInstance({
  baseUrl: API_URL,
  statusMap: {
    success: 200,
    unAuthorized: 401,
  },
  codeMap: {
    success: [200],
    unAuthorized: [401],
  },
  responseDataKey: 'data',
  responseMessageKey: 'message',
  commonHeaders: () => ({}),
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
