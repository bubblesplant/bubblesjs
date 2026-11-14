import { AsyncLocalStorage } from 'node:async_hooks'
import type { RunIdentity, RunLimits, RunStatus } from './types.ts'

export const agentContext = new AsyncLocalStorage<RunIdentity>()

/** 读取当前执行链身份；运行之外返回 undefined。 */
export function currentAgentContext(): RunIdentity | undefined {
  return agentContext.getStore()
}

export class AgentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: Exclude<RunStatus, 'completed'> = 'failed',
  ) {
    super(message)
    this.name = 'AgentError'
  }
}

/** 只向公开结果传递受控错误，底层异常正文不进入事件或 IPC。 */
export function safeError(error: unknown): AgentError {
  return error instanceof AgentError
    ? error
    : new AgentError('EXECUTION_FAILED', 'Agent execution failed')
}

/** 将异步操作与取消竞争，且始终消费原任务的拒绝以避免未处理异常。 */
export function abortable<T>(operation: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new AgentError('CANCELLED', 'Run cancelled', 'cancelled'))
    if (signal.aborted) {
      void Promise.resolve(operation).catch(() => undefined)
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(operation)
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', abort)
      })
  })
}

/** 取消检查放在模型／工具副作用之前。 */
export function checkSignal(signal: AbortSignal): void {
  if (signal.aborted) throw new AgentError('CANCELLED', 'Run cancelled', 'cancelled')
}

export const defaultLimits: Readonly<RunLimits> = Object.freeze({
  timeoutMs: 120_000,
  maxSteps: 12,
  maxModelCalls: 24,
  maxToolCalls: 32,
  maxSubagents: 8,
  maxDepth: 4,
  maxTokens: 100_000,
  maxOutputTokens: 2048,
})

/** 运行和后代只能缩小允许额度，不接受无限值或无效整数。 */
export function narrowLimits(
  parent: Readonly<RunLimits>,
  supplied?: Partial<RunLimits>,
): RunLimits {
  const result = { ...parent }
  for (const key of Object.keys(parent) as (keyof RunLimits)[]) {
    const value = supplied?.[key]
    if (value === undefined) continue
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new AgentError('INVALID_CONFIG', `Invalid limit: ${key}`)
    }
    result[key] = Math.min(parent[key], value)
  }
  return result
}

/** 根定义允许覆盖默认预算，子运行仍由 narrowLimits 收紧。 */
export function resolveLimits(supplied?: Partial<RunLimits>): RunLimits {
  const validated = narrowLimits(defaultLimits, supplied)
  for (const key of Object.keys(validated) as (keyof RunLimits)[]) {
    if (supplied?.[key] !== undefined) validated[key] = supplied[key]
  }
  return validated
}

/** FIFO 并发门；取消的等待者会立即移除，工具和子任务等待不占名额。 */
export class ModelGate {
  private active = 0
  private readonly waiting: (() => void)[] = []

  constructor(private readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new AgentError('INVALID_CONFIG', 'Invalid model concurrency')
    }
  }

  async acquire(signal: AbortSignal): Promise<() => void> {
    checkSignal(signal)
    if (this.active >= this.capacity) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          const index = this.waiting.indexOf(grant)
          if (index >= 0) this.waiting.splice(index, 1)
          reject(new AgentError('CANCELLED', 'Run cancelled', 'cancelled'))
        }
        const grant = () => {
          signal.removeEventListener('abort', abort)
          resolve()
        }
        signal.addEventListener('abort', abort, { once: true })
        this.waiting.push(grant)
      })
    } else {
      this.active++
    }
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiting.shift()
      if (next) next()
      else this.active--
    }
  }
}
