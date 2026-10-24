import { isAxiosError } from 'axios'
import { alovaRequest } from './index'
import { createAlovaInstanceFactory } from './core'
import { unAuthorizedResponseFunc } from './utils'
import { cookie } from '@/utils/storage/cookie'

const responseHandlers = alovaRequest.options.responded

/** 复用鉴权和成功响应处理；错误延后到会话／空间校验后，由现有页面反馈。 */
export const workspaceRequest = createAlovaInstanceFactory({
  ...alovaRequest.options,
  responded: {
    ...(typeof responseHandlers === 'function'
      ? { onSuccess: responseHandlers }
      : responseHandlers),
    /** 保留原始 Axios 异常，避免旧请求提前触发全局提示或登录导航。 */
    onError(error): never {
      throw error
    },
  },
})

let currentKey = ''
let generation = 0
const pending = new Set<() => void>()

/** 推进工作空间代次并中止所有在途请求，使迟到结果立即失效。 */
export function clearWorkspaceRequests() {
  generation += 1
  for (const abort of pending) abort()
  pending.clear()
  currentKey = ''
}

if (typeof window !== 'undefined') {
  window.addEventListener('auth-session-change', clearWorkspaceRequests)
  import.meta.hot?.dispose(() => {
    clearWorkspaceRequests()
    window.removeEventListener('auth-session-change', clearWorkspaceRequests)
  })
}

/** 按会话令牌和工作空间键识别切换，切换时清理旧空间请求。 */
export function enterWorkspace(key: string) {
  const identityKey = `${cookie.get('token') ?? ''}:${key}`
  if (identityKey !== currentKey) {
    clearWorkspaceRequests()
    currentKey = identityKey
  }
}

/** 通知工作空间布局重新校验权限及导航数据。 */
export function refreshAccess() {
  window.dispatchEvent(new Event('workspace-access-refresh'))
}

export const freshRequest = { cacheFor: 0, shareRequest: false } as const

/** 会话级列表与身份请求跨空间共享，仅在自身被取消或账号变化时丢弃结果。 */
export async function runSessionRequest<T>(options: {
  method: { send: (force?: boolean) => Promise<T>; abort: () => void }
  signal?: AbortSignal
}): Promise<T> {
  const { method, signal } = options
  const token = cookie.get('token')
  const stale = () => signal?.aborted || token !== cookie.get('token')
  const abort = () => method.abort()
  if (stale()) throw new DOMException('请求已取消', 'AbortError')
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const data = await method.send(true)
    if (stale()) throw new DOMException('登录会话已变化', 'AbortError')
    return data
  } catch (error) {
    if (stale()) throw new DOMException('登录会话已变化', 'AbortError')
    if (isAxiosError(error) && error.response?.status === 401) {
      unAuthorizedResponseFunc()
    }
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

/**
 * 在指定工作空间代次内发送请求，丢弃跨账号、跨空间或已取消的结果。
 * `workspaceKey` 必须由 API 创建时绑定，不能在实际发送时读取当前空间后补写。
 */
export async function runWorkspaceRequest<T>(options: {
  method: { send: (force?: boolean) => Promise<T>; abort: () => void }
  workspaceKey: string
  signal?: AbortSignal
  accessRequest?: boolean
}): Promise<T> {
  const { method, workspaceKey, signal, accessRequest } = options
  const startedAt = generation
  const token = cookie.get('token')
  const identityKey = `${token ?? ''}:${workspaceKey}`
  const abort = () => method.abort()
  /** 检查取消信号、调用方空间、工作空间代次及登录令牌，判断请求是否已经过期。 */
  const stale = () =>
    signal?.aborted ||
    currentKey !== identityKey ||
    generation !== startedAt ||
    token !== cookie.get('token')
  if (stale()) throw new DOMException('请求已取消', 'AbortError')
  pending.add(abort)
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const result = await method.send(true)
    if (stale()) throw new DOMException('工作空间已切换', 'AbortError')
    return result
  } catch (error) {
    if (stale()) throw new DOMException('工作空间已切换', 'AbortError')
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status === 401) {
      unAuthorizedResponseFunc()
    }
    if (!accessRequest && status === 403) refreshAccess()
    throw error
  } finally {
    pending.delete(abort)
    signal?.removeEventListener('abort', abort)
  }
}
