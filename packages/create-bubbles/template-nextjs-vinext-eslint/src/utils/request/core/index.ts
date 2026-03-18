import type {
  AlovaGlobalCacheAdapter,
  AlovaOptions,
  AlovaRequestAdapter,
  GlobalCacheConfig,
  StatesExport,
  StatesHook,
} from 'alova'
import type { FetchRequestInit } from 'alova/fetch'
import { createAlova } from 'alova'
import adapterFetch from 'alova/fetch'
import { deepMergeObject, isReadableStream } from './utils'

// ---- 支持的适配器联合类型 ----
type SupportedRequestConfig = FetchRequestInit
type SupportedResponse = Response
type SupportedResponseHeader = Headers

interface StatusMap {
  success?: number
  unAuthorized?: number
}

interface CodeMap {
  success?: number[]
  unAuthorized?: number[]
}

export interface BaseRequestOption<
  RC extends SupportedRequestConfig = SupportedRequestConfig,
  RE extends SupportedResponse = SupportedResponse,
  RH extends SupportedResponseHeader = SupportedResponseHeader,
  SE extends StatesExport<any> = StatesExport<any>,
> {
  baseUrl?: string
  timeout?: number
  commonHeaders?: Record<string, string | (() => string)>
  statusMap?: StatusMap
  isWrapped?: boolean
  cacheFor?: GlobalCacheConfig<any>
  cacheLogger?: boolean
  codeMap?: CodeMap
  responseDataKey?: string
  responseMessageKey?: string
  isTransformResponse?: boolean
  isShowSuccessMessage?: boolean
  successDefaultMessage?: string
  isShowErrorMessage?: boolean
  errorDefaultMessage?: string
  statesHook?: StatesHook<SE>
  successMessageFunc?: (message: string) => void
  errorMessageFunc?: (message: string) => void
  unAuthorizedResponseFunc?: () => void
  requestAdapter?: AlovaRequestAdapter<RC, RE, RH>
  storageAdapter?: AlovaGlobalCacheAdapter
}

/** method.meta 中可按请求覆盖的字段 */
export interface RequestMeta {
  isTransformResponse?: boolean
  isShowSuccessMessage?: boolean
  isShowErrorMessage?: boolean
}

function getMetaFlag(meta: Record<string, any> | undefined, key: string, fallback: boolean): boolean {
  if (meta && typeof meta[key] === 'boolean')
    return meta[key]
  return fallback
}

export function createInstance<
  RC extends SupportedRequestConfig = SupportedRequestConfig,
  RE extends SupportedResponse = SupportedResponse,
  RH extends SupportedResponseHeader = SupportedResponseHeader,
>(option: BaseRequestOption<RC, RE, RH>) {
  const defaultOption: BaseRequestOption = {
    baseUrl: '/',
    timeout: undefined,
    statusMap: { success: 200, unAuthorized: 401 },
    isWrapped: true,
    cacheFor: null,
    cacheLogger: true,
    codeMap: { success: [200], unAuthorized: [401] },
    responseDataKey: 'data',
    responseMessageKey: 'message',
    isTransformResponse: true,
    isShowSuccessMessage: false,
    successDefaultMessage: '操作成功',
    isShowErrorMessage: true,
    errorDefaultMessage: '服务异常',
    requestAdapter: adapterFetch() as AlovaRequestAdapter<any, any, any>,
  }

  const config = deepMergeObject(defaultOption as any, option as any) as Required<
    Pick<BaseRequestOption, 'statusMap' | 'codeMap' | 'responseDataKey' | 'responseMessageKey'>
  > & BaseRequestOption<RC, RE, RH>

  const alovaOptions: AlovaOptions<{
    Responded: any
    Transformed: any
    RequestConfig: RC
    Response: RE
    ResponseHeader: RH
    L1Cache: AlovaGlobalCacheAdapter
    L2Cache: AlovaGlobalCacheAdapter
    StatesExport: StatesExport<any>
  }> = {
    baseURL: config.baseUrl,
    timeout: config.timeout,
    cacheFor: config.cacheFor as any,
    cacheLogger: config.cacheLogger,
    statesHook: config.statesHook,
    l2Cache: config.storageAdapter,
    requestAdapter: config.requestAdapter!,
    beforeRequest: async (method) => {
      for (const [key, value] of Object.entries(config.commonHeaders ?? {})) {
        method.config.headers[key] = typeof value === 'function' ? value() : value
      }
    },
    responded: {
      onSuccess: async (response, method) => {
        const meta = method.meta as Record<string, any> | undefined
        const shouldTransform = getMetaFlag(meta, 'isTransformResponse', config.isTransformResponse ?? true)
        const showSuccess = getMetaFlag(meta, 'isShowSuccessMessage', config.isShowSuccessMessage ?? false)
        const showError = getMetaFlag(meta, 'isShowErrorMessage', config.isShowErrorMessage ?? true)
        const isWrapped = getMetaFlag(meta, 'isWrapped', config.isWrapped ?? true)

        if (!shouldTransform)
          return response

        // 兼容 fetch (status) 和 Taro (statusCode)
        const status = (response as any).statusCode ?? (response as any).status
        // 兼容 fetch (body 是 ReadableStream) 和 Taro (data 直接可用)
        const data
          = (response as any)?.body && isReadableStream((response as any).body)
            ? await (response as Response).json()
            : (response as any).data ?? response

        if (status !== config.statusMap.success) {
          if (config.statusMap.unAuthorized === status)
            config.unAuthorizedResponseFunc?.()
          if (showError)
            config.errorMessageFunc?.(config.errorDefaultMessage ?? '服务异常')
          return Promise.reject(response)
        }

        if (!isWrapped || (isWrapped === undefined || !config.isWrapped)) {
          if (showSuccess)
            config.successMessageFunc?.(config.successDefaultMessage ?? '操作成功')
          return data
        }

        const code = data?.code
        const responseData = data?.[config.responseDataKey]
        const responseMessage = data?.[config.responseMessageKey]

        if (!config.codeMap.success?.includes(+code)) {
          if (config.codeMap.unAuthorized?.includes(+code)) {
            config.unAuthorizedResponseFunc?.()
            return Promise.reject(response)
          }
          if (showError)
            config.errorMessageFunc?.(responseMessage ?? config.errorDefaultMessage ?? '服务异常')
          return Promise.reject(response)
        }

        if (showSuccess)
          config.successMessageFunc?.(responseMessage ?? config.successDefaultMessage)
        return responseData
      },
      onError: (error, method) => {
        const meta = method.meta as Record<string, any> | undefined
        const showError = getMetaFlag(meta, 'isShowErrorMessage', config.isShowErrorMessage ?? true)
        if (showError)
          config.errorMessageFunc?.(config.errorDefaultMessage ?? error.message)
        return Promise.reject(error)
      },
    },
  }

  return createAlova(alovaOptions)
}
