const MAX_ACTIVE_TASKS = 2
let activeTasks = 0
const waitingTasks: Array<() => void> = []

/**
 * 为摘要任务分配页面内名额。等待可取消，释放函数幂等，避免创建无界 Worker。
 * 这里只做本地并发控制，没有持久化任务队列或后台重试。
 */
export function acquireHashSlot(signal?: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()

    /** 取消尚未获得名额的请求，不影响正在运行的其他文件。 */
    const abort = () => {
      const index = waitingTasks.indexOf(start)
      if (index >= 0) waitingTasks.splice(index, 1)
      reject(signal?.reason)
    }

    /** 取走一个名额，并交还只允许生效一次的释放函数。 */
    const start = () => {
      signal?.removeEventListener('abort', abort)
      activeTasks += 1
      let released = false
      resolve(() => {
        if (released) return
        released = true
        activeTasks -= 1
        waitingTasks.shift()?.()
      })
    }

    if (activeTasks < MAX_ACTIVE_TASKS) start()
    else {
      waitingTasks.push(start)
      signal?.addEventListener('abort', abort, { once: true })
    }
  })
}
