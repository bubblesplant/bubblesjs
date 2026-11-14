import { isAxiosError } from 'axios'
import { cookie } from '@/utils/storage/cookie'
import { createAlovaInstanceFactory } from './core'
import { unAuthorizedResponseFunc } from './utils'

export interface RequestMeta {
  isShowErrorMessage?: boolean
  isTransformResponse?: boolean
}

declare module 'alova' {
  interface AlovaCustomTypes {
    meta: RequestMeta
  }
}

/** 读取后端原始正文，错误留给页面反馈以避免重复提示。 */
export const alovaRequest = createAlovaInstanceFactory({
  baseURL: `/${String(import.meta.env.VITE_API_AFFIX ?? 'api').replace(/^\/+|\/+$/g, '')}`,
  beforeRequest(method) {
    const token = cookie.get('token')
    method.config.headers.Authorization = token ? `Bearer ${token}` : ''
  },
  responded: {
    onSuccess(response, method) {
      return method.meta?.isTransformResponse ? response : response.data
    },
    onError(error): never {
      if (isAxiosError(error) && error.response?.status === 401) unAuthorizedResponseFunc()
      throw error
    },
  },
})

export default alovaRequest
