import type { WorkspacesResult } from 'shared/types'

/** 单独取消调用者的等待，不让某个路由的 AbortSignal 中断 Zustand 的共享请求。 */
export function waitForWorkspaces(promise: Promise<WorkspacesResult>, signal?: AbortSignal) {
  if (!signal) return promise
  return new Promise<WorkspacesResult>((resolve, reject) => {
    /** 导航取消应立即反馈，无需等待仍在供其他消费者使用的共享请求。 */
    const abort = () => reject(new DOMException('导航已取消', 'AbortError'))
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(
      (data) => {
        signal.removeEventListener('abort', abort)
        resolve(data)
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}
