import { fork } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AgentError, abortable, checkSignal, narrowLimits, safeError } from '../core/control.ts'
import type { Message, ProcessAgentSpec } from '../core/types.ts'
import type { ExecutionOutcome, ExecutionScope } from '../runtime/tree.ts'
import type { ControlPayload, WorkerInbound, WorkerOutbound } from './protocol.ts'

interface PendingRun {
  scope: ExecutionScope
  signal: AbortSignal
  done: AbortController
  resolve: (outcome: ExecutionOutcome) => void
  reject: (error: unknown) => void
  leases: Map<string, () => void>
}

/** 每个进程代理拥有一个按需启动的 worker，预算与授权始终回到父端。 */
export class ProcessClient {
  private child?: ChildProcess
  private startup?: Promise<void>
  private readonly runs = new Map<string, PendingRun>()
  private closed = false

  constructor(private readonly spec: ProcessAgentSpec) {
    if (!isAbsolute(spec.module) && !spec.module.startsWith('file:')) {
      throw new AgentError('INVALID_CONFIG', 'Process module must be an absolute path or file URL')
    }
  }

  /** IPC 是本机可信宿主边界，执行函数与模型客户端不经过序列化。 */
  async execute(input: { messages: Message[]; scope: ExecutionScope }): Promise<ExecutionOutcome> {
    const { scope } = input
    await abortable(this.start(), scope.signal)
    checkSignal(scope.signal)
    const runId = scope.identity.runId
    const done = new AbortController()
    let abort!: () => void
    const result = new Promise<ExecutionOutcome>((resolve, reject) => {
      const pending: PendingRun = {
        scope,
        done,
        resolve,
        reject,
        leases: new Map(),
        signal: AbortSignal.any([scope.signal, done.signal]),
      }
      this.runs.set(runId, pending)
      abort = () => {
        this.send({ type: 'cancel', runId })
        reject(new AgentError('CANCELLED', 'Run cancelled', 'cancelled'))
      }
      scope.signal.addEventListener('abort', abort, { once: true })
      this.send({
        type: 'execute',
        runId,
        identity: scope.identity,
        submittedAt: scope.submittedAt,
        messages: input.messages,
        limits: scope.limits,
      })
    })
    try {
      return await result
    } finally {
      scope.signal.removeEventListener('abort', abort)
      done.abort()
      const pending = this.runs.get(runId)
      for (const release of pending?.leases.values() ?? []) release()
      this.runs.delete(runId)
    }
  }

  /** 启动只进行一次；异常退出会清空缓存，后续运行可重建。 */
  private start(): Promise<void> {
    if (this.closed)
      return Promise.reject(new AgentError('AGENT_CLOSED', 'Process agent is closed'))
    if (this.startup) return this.startup
    this.startup = new Promise<void>((resolve, reject) => {
      const child = fork(fileURLToPath(new URL('./process/worker.mjs', import.meta.url)), [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        serialization: 'advanced',
        execArgv: [],
        windowsHide: true,
      })
      this.child = child
      const fail = () => {
        const error = new AgentError('WORKER_EXITED', 'Agent worker exited unexpectedly')
        reject(error)
        for (const run of this.runs.values()) run.reject(error)
        if (this.child === child) {
          this.child = undefined
          this.startup = undefined
        }
      }
      child.once('error', fail)
      child.once('exit', fail)
      child.on('message', (message: WorkerOutbound) => {
        if (message.type === 'ready') resolve()
        else if (message.type === 'fatal') {
          reject(new AgentError(message.error.code, message.error.message, message.error.status))
          child.kill()
        } else this.onMessage(message)
      })
      this.send({ type: 'init', spec: this.spec })
    })
    return this.startup
  }

  /** worker 发起的请求绑定原 run，结束或取消后不会留下模型许可。 */
  private onMessage(message: Exclude<WorkerOutbound, { type: 'ready' | 'fatal' }>): void {
    const run = this.runs.get(message.runId)
    if (!run) return
    if (message.type === 'result') {
      if (message.error)
        run.reject(new AgentError(message.error.code, message.error.message, message.error.status))
      else if (message.outcome) run.resolve(message.outcome)
    } else if (message.type === 'event') run.scope.tree.emit(message.event)
    else {
      void this.control(run, message.payload).then(
        (value) => this.send({ type: 'control.result', id: message.id, value }),
        (error) => {
          const failure = safeError(error)
          this.send({
            type: 'control.result',
            id: message.id,
            error: { code: failure.code, message: failure.message, status: failure.status },
          })
        },
      )
    }
  }

  /** 在父端裁决每一个预算或授权操作，worker 只能收紧限额。 */
  private async control(run: PendingRun, payload: ControlPayload): Promise<unknown> {
    checkSignal(run.signal)
    const { tree } = run.scope
    switch (payload.action) {
      case 'reserve':
        return {
          allowance: await tree.reserve({
            kind: payload.kind,
            limits: narrowLimits(run.scope.limits, payload.limits),
          }),
          usage: tree.snapshot(),
        }
      case 'account':
        return tree.account({
          usage: payload.usage,
          limits: narrowLimits(run.scope.limits, payload.limits),
        })
      case 'authorize':
        return abortable(Promise.resolve(run.scope.authorize(payload.request)), run.signal)
      case 'acquire': {
        const release = await tree.acquire(run.signal)
        if (run.signal.aborted) {
          release()
          checkSignal(run.signal)
        }
        const lease = randomUUID()
        run.leases.set(lease, release)
        return lease
      }
      case 'release':
        run.leases.get(payload.lease)?.()
        run.leases.delete(payload.lease)
        return null
    }
  }

  /** 断开的通道不写 stdout，也不暴露消息内容到错误日志。 */
  private send(message: WorkerInbound): void {
    if (this.child?.connected) this.child.send(message, () => undefined)
  }

  /** 关闭拥有的进程，并等待真实 exit，避免进程退出后仍报告有活资源。 */
  async close(): Promise<void> {
    this.closed = true
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => child.kill(), 2000)
      timer.unref()
      child.once('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new AgentError('CLOSE_FAILED', 'Agent worker cleanup failed'))
      })
      if (child.connected) this.send({ type: 'shutdown' })
      else child.kill()
    })
  }
}
