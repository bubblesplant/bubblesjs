import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { AgentError, abortable, agentContext, checkSignal, safeError } from '../core/control.ts'
import type { AgentDefinition, Usage } from '../core/types.ts'
import { bootstrapAgent } from '../runtime/agent.ts'
import type { AgentInstance } from '../runtime/agent.ts'
import type { TreeBudget } from '../runtime/tree.ts'
import type { ControlPayload, ProcessFactory, WorkerInbound, WorkerOutbound } from './protocol.ts'

let agent: AgentInstance | undefined
let initialized = false
const active = new Map<string, AbortController>()
const controls = new Map<
  string,
  { runId: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }
>()

/** worker 只通过 IPC 返回受控事件与结果；不在 stdout 打印配置。 */
function send(message: WorkerOutbound): void {
  if (process.connected) process.send?.(message, undefined, undefined, () => undefined)
}

/** 控制请求的 runId 将后代预算与授权关联到原根树。 */
function control(runId: string, payload: ControlPayload): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    controls.set(id, { runId, resolve, reject })
    send({ type: 'control', id, runId, payload })
  })
}

/** 远端预算实现与本地内核使用相同接口；许可由父端统一分配。 */
function remoteTree(runId: string): TreeBudget {
  let usage: Usage = { inputTokens: 0, outputTokens: 0 }
  return {
    async reserve(input) {
      const result = (await control(runId, { action: 'reserve', ...input })) as {
        allowance: number
        usage: Usage
      }
      usage = result.usage
      return result.allowance
    },
    async account(input) {
      usage = (await control(runId, { action: 'account', ...input })) as Usage
      return { ...usage }
    },
    async acquire(signal) {
      const pending = control(runId, { action: 'acquire' }) as Promise<string>
      let lease: string
      try {
        lease = await abortable(pending, signal)
      } catch (error) {
        void pending
          .then((value) => control(runId, { action: 'release', lease: value }))
          .catch(() => undefined)
        throw error
      }
      let released = false
      return () => {
        if (released) return
        released = true
        void control(runId, { action: 'release', lease }).catch(() => undefined)
      }
    },
    snapshot: () => ({ ...usage }),
    emit: (event) => send({ type: 'event', runId, event }),
  }
}

/** 可信工厂在目标进程重建资源，然后调用同一个 bootstrapAgent。 */
async function initialize(message: Extract<WorkerInbound, { type: 'init' }>): Promise<void> {
  if (initialized) throw new AgentError('INVALID_CONFIG', 'Worker already initialized')
  initialized = true
  const url = message.spec.module.startsWith('file:')
    ? message.spec.module
    : pathToFileURL(message.spec.module).href
  const exports = (await import(url)) as Record<string, unknown>
  const factory = exports[message.spec.exportName ?? 'default']
  if (typeof factory !== 'function')
    throw new AgentError('INVALID_CONFIG', 'Process factory export is missing')
  const definition: AgentDefinition = await (factory as ProcessFactory)(message.spec.config)
  if (!process.connected) {
    await definition.dispose?.()
    return
  }
  agent = await bootstrapAgent({ definition })
  send({ type: 'ready' })
}

/** 外层 session 和 run 生命周期由父端持有，worker 仅执行同一内核。 */
async function execute(message: Extract<WorkerInbound, { type: 'execute' }>): Promise<void> {
  const controller = new AbortController()
  active.set(message.runId, controller)
  try {
    if (!agent) throw new AgentError('WORKER_NOT_READY', 'Agent worker not initialized')
    checkSignal(controller.signal)
    const outcome = await abortable(
      agentContext.run(Object.freeze(message.identity), () =>
        agent!.executeKernel({
          messages: message.messages,
          scope: {
            identity: Object.freeze(message.identity),
            submittedAt: message.submittedAt,
            limits: message.limits,
            signal: controller.signal,
            tree: remoteTree(message.runId),
            authorize: async (request) =>
              (await control(message.runId, { action: 'authorize', request })) as boolean,
          },
        }),
      ),
      controller.signal,
    )
    send({ type: 'result', runId: message.runId, outcome })
  } catch (error) {
    const failure = safeError(error)
    send({
      type: 'result',
      runId: message.runId,
      error: { code: failure.code, message: failure.message, status: failure.status },
    })
  } finally {
    controller.abort()
    active.delete(message.runId)
    for (const [id, pending] of controls) {
      if (pending.runId !== message.runId) continue
      pending.reject(new AgentError('CANCELLED', 'Run ended', 'cancelled'))
      controls.delete(id)
    }
  }
}

process.on('message', (message: WorkerInbound) => {
  switch (message.type) {
    case 'shutdown':
      void shutdown()
      break
    case 'init':
      void initialize(message).catch((error) => {
        const failure = safeError(error)
        send({
          type: 'fatal',
          error: { code: failure.code, message: failure.message, status: failure.status },
        })
      })
      break
    case 'execute':
      void execute(message)
      break
    case 'cancel':
      active.get(message.runId)?.abort()
      break
    case 'control.result': {
      const pending = controls.get(message.id)
      if (!pending) break
      controls.delete(message.id)
      if (message.error)
        pending.reject(
          new AgentError(message.error.code, message.error.message, message.error.status),
        )
      else pending.resolve(message.value)
      break
    }
  }
})

/** 父通道断开时回收本地子实例，随后结束 worker。 */
async function shutdown(): Promise<void> {
  for (const controller of active.values()) controller.abort()
  for (const pending of controls.values())
    pending.reject(new AgentError('WORKER_DISCONNECTED', 'Parent disconnected'))
  controls.clear()
  try {
    await agent?.close()
    process.exit(0)
  } catch {
    process.exit(1)
  }
}

process.on('disconnect', () => {
  void shutdown()
})
