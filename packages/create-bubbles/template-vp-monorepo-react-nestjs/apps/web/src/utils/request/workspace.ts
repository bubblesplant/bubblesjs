import request from './index'
import { cookie } from '@/utils/storage/cookie'

/** 权限和管理数据不进入 alova 缓存；每个工作空间代次都有独立的在途请求集合。 */
export const workspaceRequest = request({
  cacheFor: { GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0, HEAD: 0, OPTIONS: 0 },
  cacheLogger: false,
  isShowErrorMessage: false,
  /** 延后到请求代次校验后再处理 401，防止旧会话的迟到失败退出新会话。 */
  unAuthorizedResponseFunc: () => {},
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
    if ((error as { status?: number }).status === 401) {
      clearWorkspaceRequests()
      cookie.remove('token')
      window.location.assign('/login')
    }
    if (!accessRequest && (error as { status?: number }).status === 403) refreshAccess()
    throw error
  } finally {
    pending.delete(abort)
    signal?.removeEventListener('abort', abort)
  }
}
