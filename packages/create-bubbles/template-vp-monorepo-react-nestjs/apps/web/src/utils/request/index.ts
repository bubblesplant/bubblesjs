import { message } from 'antd'
import { isAxiosError, type AxiosResponse } from 'axios'
import { envVariables } from '../env'
import { cookie } from '../storage/cookie'
import { createAlovaInstanceFactory } from './core'

export interface RequestMeta {
  /** 请求失败时是否显示全局错误提示，默认显示；401 始终提示登录失效。 */
  isShowErrorMessage?: boolean
  /** true 保留完整 AxiosResponse；false 或省略时返回 response.data。 */
  isTransformResponse?: boolean
}

declare module 'alova' {
  interface AlovaCustomTypes {
    meta: RequestMeta
  }
}

const UNAUTHORIZED_STATUS_CODE = 401

import { unAuthorizedResponseFunc } from './utils'

/** 按元数据保留完整响应或提取响应体，保留输入响应体的泛型关系。 */
function resolveResponse<TData>(
  response: AxiosResponse<TData, unknown>,
  meta: RequestMeta | undefined,
): TData | AxiosResponse<TData, unknown> {
  return meta?.isTransformResponse ? response : response.data
}

/** 仅采用服务端返回的非空字符串消息，其他错误体使用统一提示。 */
function getErrorMessage(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string' &&
    data.message
  ) {
    return data.message
  }
  return '请求失败'
}

/**
 * 请求泛型表示最终结果：默认使用 Get<T>；保留完整响应时使用 Get<AxiosResponse<T>>。
 * 设置 transform 时使用 Get<TResult, TInput>，TInput 与全局响应处理后的数据一致。
 */
export const alovaRequest = createAlovaInstanceFactory({
  baseURL: envVariables.API_AFFIX,
  beforeRequest(method) {
    const token = cookie.get('token')
    method.config.headers.Authorization = token ? `Bearer ${token}` : ''
  },
  responded: {
    onSuccess(response, method) {
      return resolveResponse(response, method.meta)
    },
    /** 按请求元数据提示错误，并保留原始错误供调用方处理。 */
    onError(error, method): never {
      const response = isAxiosError<unknown, unknown>(error) ? error.response : undefined
      if (response?.status === UNAUTHORIZED_STATUS_CODE) {
        unAuthorizedResponseFunc()
      } else if (method.meta?.isShowErrorMessage ?? true) {
        message.error(getErrorMessage(response?.data))
      }
      throw error
    },
    onComplete() {
      // 无论成功失败，都执行的逻辑
    },
  },
})
