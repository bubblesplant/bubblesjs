import type {
  AlovaGlobalCacheAdapter,
  AlovaOptions,
  AlovaRequestAdapter,
  GlobalCacheConfig,
  StatesExport,
  StatesHook,
} from 'alova'
import { createAlova } from 'alova'
import type { FetchRequestInit } from 'alova/fetch'
import adapterFetch from 'alova/fetch'
import { deepMergeObject, isPlainObject, isReadableStream, tryParseJsonString } from './utils'

type MaybePromise<T> = T | Promise<T>
type HeaderValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | (() => MaybePromise<string | number | boolean | null | undefined>)
type StatusMatcher<RE> = number | number[] | ((status: number, response: RE) => boolean)
type CodeMatcher = Array<number | string>

export interface StatusMap<RE = unknown> {
  success?: StatusMatcher<RE>
  unAuthorized?: StatusMatcher<RE>
}

export interface CodeMap {
  success?: CodeMatcher
  unAuthorized?: CodeMatcher
}

export interface RequestMeta {
  isWrapped?: boolean
  isTransformResponse?: boolean
  isShowSuccessMessage?: boolean
  isShowErrorMessage?: boolean
}

export interface BaseRequestOption<
  RC extends object = FetchRequestInit,
  RE = Response,
  RH = Headers,
  SE extends StatesExport<any> = StatesExport<any>,
> extends RequestMeta {
  baseUrl?: string
  timeout?: number
  commonHeaders?: () => Record<string, HeaderValue>
  statusMap?: StatusMap<RE>
  codeMap?: CodeMap
  responseCodeKey?: string
  responseDataKey?: string
  responseMessageKey?: string
  cacheFor?: GlobalCacheConfig<any> | null
  cacheLogger?: boolean
  statesHook?: StatesHook<SE>
  successDefaultMessage?: string
  errorDefaultMessage?: string
  successMessageFunc?: (message: string) => void
  errorMessageFunc?: (message: string) => void
  unAuthorizedResponseFunc?: () => void
  requestAdapter?: AlovaRequestAdapter<RC, RE, RH>
  l1Cache?: AlovaGlobalCacheAdapter
  l2Cache?: AlovaGlobalCacheAdapter
  storageAdapter?: AlovaGlobalCacheAdapter
}

export type baseRequestOption<
  RC extends object = FetchRequestInit,
  RE = Response,
  RH = Headers,
  SE extends StatesExport<any> = StatesExport<any>,
> = BaseRequestOption<RC, RE, RH, SE>

export type RequestOption<
  RC extends object = FetchRequestInit,
  RE = Response,
  RH = Headers,
  SE extends StatesExport<any> = StatesExport<any>,
> = BaseRequestOption<RC, RE, RH, SE>

type RequestAlovaGenerics<RC extends object, RE, RH, SE extends StatesExport<any>> = {
  Responded: unknown
  Transformed: unknown
  RequestConfig: RC
  Response: RE
  ResponseHeader: RH
  L1Cache: AlovaGlobalCacheAdapter
  L2Cache: AlovaGlobalCacheAdapter
  StatesExport: SE
}

type ResolvedRequestOption<RC extends object, RE, RH, SE extends StatesExport<any>> = Required<
  Pick<
    BaseRequestOption<RC, RE, RH, SE>,
    | 'baseUrl'
    | 'statusMap'
    | 'codeMap'
    | 'responseCodeKey'
    | 'responseDataKey'
    | 'responseMessageKey'
    | 'isWrapped'
    | 'isTransformResponse'
    | 'isShowSuccessMessage'
    | 'successDefaultMessage'
    | 'isShowErrorMessage'
    | 'errorDefaultMessage'
    | 'cacheLogger'
  >
> &
  BaseRequestOption<RC, RE, RH, SE>

const DEFAULT_SUCCESS_MESSAGE = '操作成功'
const DEFAULT_ERROR_MESSAGE = '服务异常'

const defaultRequestOption: BaseRequestOption<any, any, any, any> = {
  baseUrl: '/',
  timeout: undefined,
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
  responseMessageKey: 'message',
  isWrapped: true,
  isTransformResponse: true,
  isShowSuccessMessage: false,
  successDefaultMessage: DEFAULT_SUCCESS_MESSAGE,
  isShowErrorMessage: true,
  errorDefaultMessage: DEFAULT_ERROR_MESSAGE,
  cacheFor: null,
  cacheLogger: true,
  requestAdapter: adapterFetch() as AlovaRequestAdapter<any, any, any>,
}

function getMethodMeta(method: unknown): RequestMeta {
  const methodRecord = method as { meta?: RequestMeta; config?: { meta?: RequestMeta } } | undefined
  return methodRecord?.config?.meta ?? methodRecord?.meta ?? {}
}

function getMetaFlag(meta: RequestMeta, key: keyof RequestMeta, fallback: boolean): boolean {
  const value = meta[key]
  return typeof value === 'boolean' ? value : fallback
}

function isMatchedStatus<RE>(
  status: number,
  matcher: StatusMatcher<RE> | undefined,
  response: RE,
): boolean {
  if (matcher === undefined) return status >= 200 && status < 300

  if (typeof matcher === 'function') return matcher(status, response)

  return Array.isArray(matcher) ? matcher.includes(status) : matcher === status
}

function isMatchedCode(code: unknown, matcher: CodeMatcher | undefined): boolean {
  if (!matcher?.length) return true

  return matcher.some((item) => String(item) === String(code))
}

function getResponseStatus(response: unknown): number {
  const responseRecord = response as { status?: unknown; statusCode?: unknown }
  const status = responseRecord.statusCode ?? responseRecord.status
  return typeof status === 'number' ? status : Number(status)
}

function getResponseMessage(data: unknown, messageKey: string, defaultMessage: string): string {
  if (!isPlainObject(data)) return defaultMessage

  const message = data[messageKey] ?? data.message ?? data.msg
  if (typeof message === 'string') return message || defaultMessage
  if (typeof message === 'number') return String(message)

  return defaultMessage
}

function getResponseField(data: unknown, key: string): unknown {
  return isPlainObject(data) ? data[key] : undefined
}

async function parseFetchResponse(response: {
  status?: number
  body?: unknown
  headers?: Headers | Record<string, unknown>
  clone?: () => Response
  json?: () => Promise<unknown>
  text?: () => Promise<string>
}): Promise<unknown> {
  if (response.status === 204) return undefined

  const reader = typeof response.clone === 'function' ? response.clone() : response
  const contentType = getHeaderValue(response.headers, 'content-type')

  if (contentType.includes('application/json') && typeof reader.json === 'function')
    return reader.json()

  if (contentType.startsWith('text/') && typeof reader.text === 'function')
    return tryParseJsonString(await reader.text())

  if (typeof reader.json === 'function') {
    try {
      return await reader.json()
    } catch {
      // Fall through to text parsing.
    }
  }

  if (typeof reader.text === 'function') return tryParseJsonString(await reader.text())

  return undefined
}

function getHeaderValue(
  headers: Headers | Record<string, unknown> | undefined,
  key: string,
): string {
  if (!headers) return ''

  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(key) ?? ''

  const headerRecord = headers as Record<string, unknown>
  const value =
    headerRecord[key] ?? headerRecord[key.toLowerCase()] ?? headerRecord[key.toUpperCase()]
  return typeof value === 'string' ? value : ''
}

async function getResponseData(response: unknown): Promise<unknown> {
  const responseRecord = response as {
    body?: unknown
    data?: unknown
    json?: () => Promise<unknown>
    text?: () => Promise<string>
  }

  if ('data' in responseRecord && !isReadableStream(responseRecord.body))
    return tryParseJsonString(responseRecord.data)

  if (
    isReadableStream(responseRecord.body) ||
    typeof responseRecord.json === 'function' ||
    typeof responseRecord.text === 'function'
  ) {
    return parseFetchResponse(responseRecord)
  }

  return response
}

async function resolveHeaderValue(value: HeaderValue): Promise<string | undefined> {
  const resolved = typeof value === 'function' ? await value() : value
  if (resolved === null || resolved === undefined) return undefined
  return String(resolved)
}

function setHeader(target: unknown, key: string, value: string): void {
  if (typeof Headers !== 'undefined' && target instanceof Headers) {
    target.set(key, value)
    return
  }

  if (Array.isArray(target)) {
    target.push([key, value])
    return
  }

  ;(target as Record<string, string>)[key] = value
}

function resolveConfig<RC extends object, RE, RH, SE extends StatesExport<any>>(
  option: BaseRequestOption<RC, RE, RH, SE>,
): ResolvedRequestOption<RC, RE, RH, SE> {
  return deepMergeObject(defaultRequestOption, option) as ResolvedRequestOption<RC, RE, RH, SE>
}

export function createInstance<
  RC extends object = FetchRequestInit,
  RE = Response,
  RH = Headers,
  SE extends StatesExport<any> = StatesExport<any>,
>(option: RequestOption<RC, RE, RH, SE> = {}) {
  const config = resolveConfig(option)

  const alovaOptions: AlovaOptions<RequestAlovaGenerics<RC, RE, RH, SE>> = {
    baseURL: config.baseUrl,
    timeout: config.timeout,
    cacheFor: config.cacheFor as GlobalCacheConfig<any>,
    cacheLogger: config.cacheLogger,
    statesHook: config.statesHook,
    requestAdapter: config.requestAdapter!,
    l1Cache: config.l1Cache,
    l2Cache: config.l2Cache ?? config.storageAdapter,
    beforeRequest: async (method) => {
      const methodConfig = method.config as { headers?: unknown }
      const headers = methodConfig.headers ?? {}
      methodConfig.headers = headers

      for (const [key, value] of Object.entries(config.commonHeaders?.() ?? {})) {
        const resolvedValue = await resolveHeaderValue(value)
        if (resolvedValue !== undefined) setHeader(headers, key, resolvedValue)
      }
    },
    responded: {
      onSuccess: async (response, method) => {
        const meta = getMethodMeta(method)
        const shouldTransform = getMetaFlag(meta, 'isTransformResponse', config.isTransformResponse)
        const showSuccess = getMetaFlag(meta, 'isShowSuccessMessage', config.isShowSuccessMessage)
        const showError = getMetaFlag(meta, 'isShowErrorMessage', config.isShowErrorMessage)
        const isWrapped = getMetaFlag(meta, 'isWrapped', config.isWrapped)

        if (!shouldTransform) return response

        const status = getResponseStatus(response)
        const data = await getResponseData(response)

        if (!isMatchedStatus(status, config.statusMap.success, response)) {
          if (isMatchedStatus(status, config.statusMap.unAuthorized, response))
            config.unAuthorizedResponseFunc?.()

          if (showError) {
            config.errorMessageFunc?.(
              getResponseMessage(data, config.responseMessageKey, config.errorDefaultMessage),
            )
          }
          return Promise.reject(response)
        }

        if (!isWrapped) {
          if (showSuccess) config.successMessageFunc?.(config.successDefaultMessage)
          return data
        }

        const code = getResponseField(data, config.responseCodeKey)
        const responseData = getResponseField(data, config.responseDataKey)
        const responseMessage = getResponseMessage(
          data,
          config.responseMessageKey,
          config.successDefaultMessage,
        )

        if (!isMatchedCode(code, config.codeMap.success)) {
          if (isMatchedCode(code, config.codeMap.unAuthorized)) config.unAuthorizedResponseFunc?.()

          if (showError) {
            config.errorMessageFunc?.(
              getResponseMessage(data, config.responseMessageKey, config.errorDefaultMessage),
            )
          }
          return Promise.reject(response)
        }

        if (showSuccess) config.successMessageFunc?.(responseMessage)

        return responseData
      },
      onError: (error, method) => {
        const meta = getMethodMeta(method)
        const showError = getMetaFlag(meta, 'isShowErrorMessage', config.isShowErrorMessage)

        if (showError) {
          config.errorMessageFunc?.(
            error instanceof Error ? error.message : config.errorDefaultMessage,
          )
        }
        return Promise.reject(error)
      },
    },
  }

  return createAlova(alovaOptions)
}

export type RequestInstance<
  RC extends object = FetchRequestInit,
  RE = Response,
  RH = Headers,
  SE extends StatesExport<any> = StatesExport<any>,
> = ReturnType<typeof createInstance<RC, RE, RH, SE>>

export type DualCallInstance<
  RC extends object = FetchRequestInit,
  RE = Response,
  RH = Headers,
  SE extends StatesExport<any> = StatesExport<any>,
> = RequestInstance<RC, RE, RH, SE> &
  ((option?: RequestOption<RC, RE, RH, SE>) => RequestInstance<RC, RE, RH, SE>)

export function createDualCallInstance<
  RC extends object = FetchRequestInit,
  RE = Response,
  RH = Headers,
  SE extends StatesExport<any> = StatesExport<any>,
>(baseConfig: BaseRequestOption<RC, RE, RH, SE>): DualCallInstance<RC, RE, RH, SE> {
  const defaultInstance = createInstance(baseConfig)
  const dualInstance = ((option?: RequestOption<RC, RE, RH, SE>) => {
    if (!option) return defaultInstance
    return createInstance(deepMergeObject(baseConfig, option))
  }) as DualCallInstance<RC, RE, RH, SE>

  Object.assign(dualInstance, defaultInstance)
  dualInstance.Get = defaultInstance.Get.bind(defaultInstance)
  dualInstance.Post = defaultInstance.Post.bind(defaultInstance)
  dualInstance.Put = defaultInstance.Put.bind(defaultInstance)
  dualInstance.Delete = defaultInstance.Delete.bind(defaultInstance)
  dualInstance.Patch = defaultInstance.Patch.bind(defaultInstance)
  dualInstance.Head = defaultInstance.Head.bind(defaultInstance)
  dualInstance.Options = defaultInstance.Options.bind(defaultInstance)
  dualInstance.Request = defaultInstance.Request.bind(defaultInstance)

  return dualInstance
}
