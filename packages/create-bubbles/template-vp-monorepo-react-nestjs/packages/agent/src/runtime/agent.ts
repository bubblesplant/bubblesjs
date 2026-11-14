import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  AgentError,
  abortable,
  agentContext,
  checkSignal,
  ModelGate,
  narrowLimits,
  resolveLimits,
  safeError,
} from '../core/control.ts'
import type {
  AgentDefinition,
  AgentSource,
  AgentTool,
  BootstrapOptions,
  DelegateInput,
  HostOptions,
  Message,
  ModelResponse,
  RunIdentity,
  RunInput,
  RunResult,
  ToolCall,
  ToolContext,
} from '../core/types.ts'
import { canFallback } from '../model/http.ts'
import { ProcessClient } from '../process/client.ts'
import { defineTool } from '../tools/define.ts'
import { emitEvent, RootBudget } from './tree.ts'
import type { ExecutionOutcome, ExecutionScope } from './tree.ts'

interface Session {
  messages: Message[]
  tail: Promise<void>
  pending: number
}

/** 宿主只管理自身实例及模型请求许可，不持有用户会话的全局历史。 */
export class AgentHost {
  readonly gate: ModelGate
  private readonly instances = new Set<AgentInstance>()
  private closed = false
  private closing?: Promise<void>

  constructor(readonly options: HostOptions = {}) {
    this.gate = new ModelGate(options.maxConcurrentModels ?? 4)
  }

  /** 工厂内部注册资源归属；关闭后拒绝产生新实例。 */
  attach(instance: AgentInstance): void {
    if (this.closed) throw new AgentError('HOST_CLOSED', 'Agent host is closed')
    this.instances.add(instance)
  }

  detach(instance: AgentInstance): void {
    this.instances.delete(instance)
  }

  /** 事件观察者的同步异常不能中断运行；事件内容与宿主内存隔离。 */
  emit = (event: Parameters<NonNullable<HostOptions['onEvent']>>[0]): void => {
    try {
      void Promise.resolve(this.options.onEvent?.(structuredClone(event))).catch(() => undefined)
    } catch {
      /* Observer only. */
    }
  }

  /** 终止所有自有实例；多次调用共享相同的清理任务。 */
  close(): Promise<void> {
    if (!this.closing) {
      this.closed = true
      this.closing = Promise.allSettled(
        [...this.instances].map((instance) => instance.close()),
      ).then((results) => {
        if (results.some((result) => result.status === 'rejected'))
          throw new AgentError('CLOSE_FAILED', 'Agent resource cleanup failed')
      })
    }
    return this.closing
  }
}

/** 创建可跨多个实例共享的进程级资源宿主。 */
export function createAgentHost(options: HostOptions = {}): AgentHost {
  return new AgentHost(options)
}

/** 一个可复用配置实例；主代理、本地子代理与进程代理具有同样的生命周期。 */
export class AgentInstance {
  readonly id = randomUUID()
  readonly name: string
  private readonly sessions = new Map<string, Session>()
  private readonly children = new Map<string, Promise<AgentInstance>>()
  private readonly ownedChildren = new Set<AgentInstance>()
  private readonly active = new Map<AbortController, Promise<unknown>>()
  private readonly shutdown = new AbortController()
  private readonly definition?: AgentDefinition
  private readonly processClient?: ProcessClient
  private readonly tools: readonly AgentTool[]
  private closing?: Promise<void>

  constructor(private readonly options: Required<BootstrapOptions>) {
    this.name = options.definition.name
    if (!this.name.trim()) throw new AgentError('INVALID_CONFIG', 'Agent name is required')
    if ('kind' in options.definition) {
      this.processClient = new ProcessClient(options.definition)
      this.tools = []
    } else {
      // 保留函数引用，仅拷贝可变配置容器。
      this.definition = {
        ...options.definition,
        tools: [...(options.definition.tools ?? [])],
        fallbacks: [...(options.definition.fallbacks ?? [])],
        subagents: { ...options.definition.subagents },
        limits: { ...options.definition.limits },
      }
      resolveLimits(this.definition.limits)
      const tools = [...(this.definition.tools ?? [])]
      if (Object.keys(this.definition.subagents ?? {}).length) {
        tools.push(
          defineTool({
            name: 'delegate_agent',
            description: `Delegate a task and wait for its result. Available agents: ${Object.keys(this.definition.subagents ?? {}).join(', ')}`,
            schema: z.object({ agent: z.string().min(1), input: z.string().min(1) }).strict(),
            execute: (input, context) => context.delegate(input),
            timeoutMs: resolveLimits(this.definition.limits).timeoutMs,
          }),
        )
      }
      if (new Set(tools.map((tool) => tool.name)).size !== tools.length) {
        throw new AgentError('INVALID_CONFIG', 'Duplicate or reserved tool name')
      }
      this.tools = tools
    }
    options.host.attach(this)
  }

  /** 提交独立根运行；不同 session 可以并行，相同 session 原子提交成功历史。 */
  run(input: RunInput): Promise<RunResult> {
    return this.runLinked(input)
  }

  /** 返回深拷贝，调用方不能修改后续模型看到的历史。 */
  history(sessionId: string): readonly Message[] {
    return structuredClone(this.sessions.get(sessionId)?.messages ?? [])
  }

  /** 活跃或排队的会话不可删除，避免同一 session 出现两条并行历史。 */
  clearSession(sessionId: string): void {
    if (this.sessions.get(sessionId)?.pending)
      throw new AgentError('SESSION_BUSY', 'Session is busy')
    this.sessions.delete(sessionId)
  }

  /** 内部委派入口继承预算、祖先权限和取消链，不继承父会话。 */
  async runLinked(input: RunInput, parent?: ExecutionScope): Promise<RunResult> {
    if (this.shutdown.signal.aborted) throw new AgentError('AGENT_CLOSED', 'Agent is closed')
    if (!input.input.trim()) throw new AgentError('INVALID_INPUT', 'Input is required')
    const baseLimits = parent
      ? narrowLimits(parent.limits, this.definition?.limits)
      : resolveLimits(this.definition?.limits)
    const limits = narrowLimits(baseLimits, input.limits)
    const identity: RunIdentity = Object.freeze({
      agentId: this.id,
      agentName: this.name,
      runId: randomUUID(),
      sessionId: input.sessionId ?? randomUUID(),
      depth: parent ? parent.identity.depth + 1 : 0,
      ...(parent ? { parentRunId: parent.identity.runId } : {}),
    })
    const controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      this.shutdown.signal,
      ...(input.signal ? [input.signal] : []),
      ...(parent ? [parent.signal] : []),
    ])
    const timer = setTimeout(() => controller.abort('timeout'), limits.timeoutMs)
    timer.unref()
    const scope: ExecutionScope = {
      identity,
      submittedAt: Date.now(),
      limits,
      signal,
      tree:
        parent?.tree ??
        new RootBudget({ gate: this.options.host.gate, emit: this.options.host.emit, signal }),
      authorize: parent?.authorize ?? (() => true),
    }
    const session = this.sessions.get(identity.sessionId) ?? {
      messages: [],
      tail: Promise.resolve(),
      pending: 0,
    }
    this.sessions.set(identity.sessionId, session)
    session.pending++
    const previous = session.tail
    let release!: () => void
    const ticket = new Promise<void>((resolve) => {
      release = resolve
    })
    session.tail = previous.then(() => ticket)
    const operation = agentContext.run(identity, async (): Promise<RunResult> => {
      emitEvent(scope, { type: 'run.started' })
      try {
        if (identity.depth > limits.maxDepth)
          throw new AgentError('DEPTH_EXCEEDED', 'Agent nesting depth exceeded', 'limit_exceeded')
        await abortable(previous, signal)
        checkSignal(signal)
        const messages: Message[] = [
          ...structuredClone(session.messages),
          { role: 'user', content: input.input },
        ]
        const outcome = await abortable(this.executeKernel({ messages, scope }), signal)
        checkSignal(signal)
        session.messages = structuredClone(outcome.messages)
        emitEvent(scope, { type: 'run.completed' })
        return {
          identity,
          status: 'completed',
          output: outcome.output,
          usage: scope.tree.snapshot(),
        }
      } catch (error) {
        const failure = signal.aborted
          ? new AgentError(
              signal.reason === 'timeout' ? 'TIMEOUT' : 'CANCELLED',
              signal.reason === 'timeout' ? 'Run timed out' : 'Run cancelled',
              'cancelled',
            )
          : safeError(error)
        emitEvent(scope, {
          type: failure.status === 'cancelled' ? 'run.cancelled' : 'run.failed',
          code: failure.code,
        })
        return {
          identity,
          status: failure.status,
          output: '',
          usage: scope.tree.snapshot(),
          error: { code: failure.code, message: failure.message },
        }
      } finally {
        controller.abort()
        clearTimeout(timer)
        session.pending--
        release()
      }
    })
    this.active.set(controller, operation)
    try {
      return await operation
    } finally {
      this.active.delete(controller)
    }
  }

  /** worker 与本地实例复用的完整模型／工具循环；历史由外层运行原子提交。 */
  async executeKernel(input: {
    messages: Message[]
    scope: ExecutionScope
  }): Promise<ExecutionOutcome> {
    const { messages } = input
    const definition = this.definition
    const limits = narrowLimits(input.scope.limits, definition?.limits)
    const controller = new AbortController()
    const remaining = input.scope.submittedAt + limits.timeoutMs - Date.now()
    const timer = setTimeout(() => controller.abort('timeout'), Math.max(1, remaining))
    timer.unref()
    const scope: ExecutionScope = {
      ...input.scope,
      limits,
      signal: AbortSignal.any([input.scope.signal, this.shutdown.signal, controller.signal]),
      authorize: async (request) =>
        (await input.scope.authorize(request)) &&
        (!this.options.host.options.authorize ||
          (await this.options.host.options.authorize(request))) &&
        (!definition?.authorize || (await definition.authorize(request))),
    }
    try {
      if (remaining <= 0) throw new AgentError('TIMEOUT', 'Run timed out', 'cancelled')
      if (scope.identity.depth > limits.maxDepth)
        throw new AgentError('DEPTH_EXCEEDED', 'Agent nesting depth exceeded', 'limit_exceeded')
      return await abortable(
        agentContext.run(scope.identity, async () => {
          if (this.processClient) return this.processClient.execute({ messages, scope })
          for (let step = 0; step < scope.limits.maxSteps; step++) {
            checkSignal(scope.signal)
            const response = await this.callModel({ messages, scope })
            checkSignal(scope.signal)
            await scope.tree.account({ usage: response.usage, limits: scope.limits })
            emitEvent(scope, { type: 'model.completed', usage: response.usage })
            if (response.finishReason === 'length')
              throw new AgentError(
                'MODEL_TRUNCATED',
                'Model output limit reached',
                'limit_exceeded',
              )
            const calls = response.toolCalls ?? []
            if (
              new Set(calls.map((call) => call.id)).size !== calls.length ||
              calls.some((call) => !call.id)
            ) {
              throw new AgentError('INVALID_MODEL_RESPONSE', 'Invalid tool call identifiers')
            }
            messages.push({
              role: 'assistant',
              content: response.text,
              ...(calls.length ? { toolCalls: structuredClone(calls) } : {}),
            })
            if (!calls.length) return { output: response.text, messages }
            for (const call of calls) messages.push(await this.callTool({ call, scope }))
          }
          throw new AgentError('STEPS_EXCEEDED', 'Model step limit exceeded', 'limit_exceeded')
        }),
        scope.signal,
      )
    } catch (error) {
      if (controller.signal.aborted) throw new AgentError('TIMEOUT', 'Run timed out', 'cancelled')
      throw error
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }

  /** 当前回合 fallback 不重放任何先前工具，只重发相同消息快照。 */
  private async callModel(input: {
    messages: Message[]
    scope: ExecutionScope
  }): Promise<ModelResponse> {
    const { scope, messages } = input
    const models = [this.definition!.model, ...(this.definition!.fallbacks ?? [])]
    for (const [index, model] of models.entries()) {
      const release = await scope.tree.acquire(scope.signal)
      try {
        checkSignal(scope.signal)
        const maxOutputTokens = await scope.tree.reserve({ kind: 'model', limits: scope.limits })
        emitEvent(scope, { type: 'model.started', modelId: model.id })
        return await abortable(
          model.generate({
            systemPrompt: this.definition!.systemPrompt,
            messages: structuredClone(messages),
            tools: this.tools.map(({ name, description, inputSchema }) => ({
              name,
              description,
              inputSchema: structuredClone(inputSchema),
            })),
            signal: scope.signal,
            maxOutputTokens,
          }),
          scope.signal,
        )
      } catch (error) {
        checkSignal(scope.signal)
        if (index === models.length - 1 || !canFallback(error)) throw error
        emitEvent(scope, { type: 'model.fallback', modelId: model.id })
      } finally {
        release()
      }
    }
    throw new AgentError('MODEL_UNAVAILABLE', 'No model available')
  }

  /** 参数校验和祖先权限都通过后才执行；工具失败不暴露底层异常正文。 */
  private async callTool(input: { call: ToolCall; scope: ExecutionScope }): Promise<Message> {
    const { call, scope } = input
    checkSignal(scope.signal)
    await scope.tree.reserve({ kind: 'tool', limits: scope.limits })
    emitEvent(scope, { type: 'tool.started', toolName: call.name })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const tool = this.tools.find((candidate) => candidate.name === call.name)
      if (!tool) throw new AgentError('UNKNOWN_TOOL', 'Tool is not registered')
      const parsed = tool.parse(call.input)
      if (
        !(await abortable(
          Promise.resolve(
            scope.authorize({
              identity: scope.identity,
              toolName: call.name,
              input: structuredClone(parsed),
            }),
          ),
          scope.signal,
        ))
      ) {
        throw new AgentError('TOOL_DENIED', 'Tool execution denied')
      }
      checkSignal(scope.signal)
      const controller = new AbortController()
      timer = setTimeout(() => controller.abort(), tool.timeoutMs)
      timer.unref()
      const signal = AbortSignal.any([controller.signal, scope.signal])
      const context: ToolContext = {
        identity: scope.identity,
        signal,
        delegate: (request) => this.delegate({ request, scope: { ...scope, signal } }),
      }
      let result: unknown
      try {
        result = await abortable(
          Promise.resolve().then(() => tool.execute(parsed, context)),
          signal,
        )
      } catch (error) {
        checkSignal(scope.signal)
        if (controller.signal.aborted) throw new AgentError('TOOL_TIMEOUT', 'Tool timed out')
        throw error
      }
      checkSignal(signal)
      const content = JSON.stringify(result ?? null)
      emitEvent(scope, { type: 'tool.completed', toolName: call.name })
      return { role: 'tool', toolCallId: call.id, name: call.name, content }
    } catch (error) {
      checkSignal(scope.signal)
      const failure = safeError(error)
      if (failure.status === 'limit_exceeded' || failure.status === 'cancelled') throw failure
      emitEvent(scope, { type: 'tool.failed', toolName: call.name, code: failure.code })
      return {
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify({ error: { code: failure.code, message: failure.message } }),
        isError: true,
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /** 只允许委派宿主声明的模板；每次分配独立 run 与新 session。 */
  private async delegate(input: {
    request: DelegateInput
    scope: ExecutionScope
  }): Promise<RunResult> {
    const { request, scope } = input
    checkSignal(scope.signal)
    const source = Object.hasOwn(this.definition!.subagents ?? {}, request.agent)
      ? this.definition!.subagents![request.agent]
      : undefined
    if (!source) throw new AgentError('UNKNOWN_AGENT', 'Subagent is not registered')
    if (scope.identity.depth >= scope.limits.maxDepth)
      throw new AgentError('DEPTH_EXCEEDED', 'Agent nesting depth exceeded', 'limit_exceeded')
    await scope.tree.reserve({ kind: 'subagent', limits: scope.limits })
    const child = await abortable(this.getChild(request.agent, source), scope.signal)
    checkSignal(scope.signal)
    emitEvent(scope, { type: 'agent.delegated', childAgent: request.agent })
    const result = await child.runLinked({ input: request.input }, scope)
    if (result.status === 'limit_exceeded')
      throw new AgentError(result.error!.code, result.error!.message, 'limit_exceeded')
    return result
  }

  /** 同一声明只初始化一次；借入实例的生命周期仍归原调用方。 */
  private getChild(name: string, source: AgentSource): Promise<AgentInstance> {
    if (source instanceof AgentInstance) return Promise.resolve(source)
    const existing = this.children.get(name)
    if (existing) return existing
    const pending = Promise.resolve().then(async () => {
      const definition = typeof source === 'function' ? await source() : source
      if (this.shutdown.signal.aborted) {
        if (!('kind' in definition)) await definition.dispose?.()
        throw new AgentError('AGENT_CLOSED', 'Agent is closed')
      }
      let child: AgentInstance
      try {
        child = await bootstrapAgent({ definition, host: this.options.host })
      } catch (error) {
        if (!('kind' in definition)) await definition.dispose?.()
        throw error
      }
      this.ownedChildren.add(child)
      if (this.shutdown.signal.aborted) await child.close()
      return child
    })
    this.children.set(name, pending)
    void pending.catch(() => {
      this.children.delete(name)
    })
    return pending
  }

  /** 先传播取消再回收自有实例和 worker，不销毁借入的子实例。 */
  close(): Promise<void> {
    if (!this.closing) {
      this.shutdown.abort()
      this.closing = (async () => {
        await Promise.allSettled(this.active.values())
        const cleanups = await Promise.allSettled([
          ...[...this.ownedChildren].map((child) => child.close()),
          this.processClient?.close(),
        ])
        try {
          await this.definition?.dispose?.()
          if (cleanups.some((result) => result.status === 'rejected'))
            throw new AgentError('CLOSE_FAILED', 'Agent resource cleanup failed')
        } catch {
          throw new AgentError('CLOSE_FAILED', 'Agent resource cleanup failed')
        } finally {
          this.sessions.clear()
          this.options.host.detach(this)
        }
      })()
    }
    return this.closing
  }
}

/** 所有主代理、子代理和 worker 都从此处初始化，不创建隐式单例。 */
export async function bootstrapAgent(options: BootstrapOptions): Promise<AgentInstance> {
  return new AgentInstance({
    definition: options.definition,
    host: options.host ?? createAgentHost(),
  })
}
