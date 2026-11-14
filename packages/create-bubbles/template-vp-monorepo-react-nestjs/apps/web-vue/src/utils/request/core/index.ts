import type { AlovaAxiosRequestConfig } from '@alova/adapter-axios'
import type {
  Alova,
  AlovaDefaultCacheAdapter,
  AlovaGlobalCacheAdapter,
  AlovaOptions,
  Method,
} from 'alova'
import type { VueHookExportType } from 'alova/vue'
import type { AxiosResponse, AxiosResponseHeaders } from 'axios'
import { axiosRequestAdapter } from '@alova/adapter-axios'
import { createAlova } from 'alova'
import VueHook from 'alova/vue'
import axios from 'axios'

/** 全局拦截器不知道各接口的最终结果；逐接口结果由 alova 请求方法的泛型指定。 */
interface AxiosRequestTypes<
  TResponse,
  TL1Cache extends AlovaGlobalCacheAdapter,
  TL2Cache extends AlovaGlobalCacheAdapter,
> {
  Responded: unknown
  Transformed: unknown
  RequestConfig: AlovaAxiosRequestConfig
  Response: AxiosResponse<TResponse, unknown>
  ResponseHeader: AxiosResponseHeaders
  L1Cache: TL1Cache
  L2Cache: TL2Cache
  StatesExport: VueHookExportType<unknown>
}

/** 保留原生拦截器参数，同时将库声明中的错误和返回值 any 收紧为 unknown。 */
interface RequestInterceptors<
  TTypes extends AxiosRequestTypes<unknown, AlovaGlobalCacheAdapter, AlovaGlobalCacheAdapter>,
> {
  onSuccess?: (response: TTypes['Response'], method: Method<TTypes>) => unknown
  onError?: (error: unknown, method: Method<TTypes>) => void | Promise<void>
  onComplete?: (method: Method<TTypes>) => void | Promise<void>
}

/** 默认缓存不能满足显式声明的自定义缓存类型时，必须提供对应实例。 */
type RequiredCustomCache<
  TKey extends 'l1Cache' | 'l2Cache',
  TCache,
> = AlovaDefaultCacheAdapter extends TCache ? unknown : { [Key in TKey]: TCache }

/** TResponse 是全局拦截器收到的响应体类型，不是每个接口的最终返回类型。 */
export type RequestOptions<
  TResponse = unknown,
  TL1Cache extends AlovaGlobalCacheAdapter = AlovaDefaultCacheAdapter,
  TL2Cache extends AlovaGlobalCacheAdapter = AlovaDefaultCacheAdapter,
> = Omit<
  AlovaOptions<AxiosRequestTypes<TResponse, TL1Cache, TL2Cache>>,
  'requestAdapter' | 'statesHook' | 'id' | 'cacheFor' | 'cacheLogger' | 'shareRequest' | 'responded'
> &
  RequiredCustomCache<'l1Cache', TL1Cache> &
  RequiredCustomCache<'l2Cache', TL2Cache> & {
    responded?:
      | RequestInterceptors<AxiosRequestTypes<TResponse, TL1Cache, TL2Cache>>['onSuccess']
      | RequestInterceptors<AxiosRequestTypes<TResponse, TL1Cache, TL2Cache>>
  }

/**
 * 创建 Axios + Vue 请求实例，保留 alova 的请求方法、transform 和 Hooks 泛型。
 * 数组 Query 默认编码为重复同名参数，匹配后端的严格字段校验。
 * @typeParam TResponse 全局响应体类型；各接口仍使用 Get<TResult, TInput> 等方法声明结果。
 * @typeParam TL1Cache 内存缓存适配器类型，默认使用 alova 内置适配器。
 * @typeParam TL2Cache 持久化缓存适配器类型，默认使用 alova 内置适配器。
 */
export function createAlovaInstanceFactory<
  TResponse = unknown,
  TL1Cache extends AlovaGlobalCacheAdapter = AlovaDefaultCacheAdapter,
  TL2Cache extends AlovaGlobalCacheAdapter = AlovaDefaultCacheAdapter,
>(
  options: RequestOptions<TResponse, TL1Cache, TL2Cache>,
): Alova<AxiosRequestTypes<TResponse, TL1Cache, TL2Cache>> {
  return createAlova({
    ...options,
    requestAdapter: axiosRequestAdapter({
      axios: axios.create({
        paramsSerializer: { indexes: null },
      }),
    }),
    id: 'default',
    statesHook: VueHook,
    cacheFor: null,
    cacheLogger: import.meta.env.DEV,
    shareRequest: true,
  })
}
