import { AgentError, ModelGate, checkSignal } from '../core/control.ts'
import type {
  AgentEvent,
  Authorize,
  Message,
  RunIdentity,
  RunLimits,
  Usage,
} from '../core/types.ts'

export type BudgetKind = 'model' | 'tool' | 'subagent'

export interface TreeBudget {
  reserve: (input: { kind: BudgetKind; limits: RunLimits }) => Promise<number>
  account: (input: { usage: Usage; limits: RunLimits }) => Promise<Usage>
  acquire: (signal: AbortSignal) => Promise<() => void>
  snapshot: () => Usage
  emit: (event: AgentEvent) => void
}

export interface ExecutionScope {
  identity: RunIdentity
  submittedAt: number
  limits: RunLimits
  signal: AbortSignal
  tree: TreeBudget
  authorize: Authorize
}

export interface ExecutionOutcome {
  output: string
  messages: Message[]
}

/** 每棵根任务树唯一的计数器；跨进程操作也由该对象统一裁决。 */
export class RootBudget implements TreeBudget {
  private readonly counts = { model: 0, tool: 0, subagent: 0 }
  private readonly usage: Usage = { inputTokens: 0, outputTokens: 0 }

  constructor(
    private readonly options: {
      gate: ModelGate
      emit: (event: AgentEvent) => void
      signal: AbortSignal
    },
  ) {}

  async reserve(input: { kind: BudgetKind; limits: RunLimits }): Promise<number> {
    checkSignal(this.options.signal)
    const maximum = {
      model: input.limits.maxModelCalls,
      tool: input.limits.maxToolCalls,
      subagent: input.limits.maxSubagents,
    }[input.kind]
    const remainingTokens =
      input.limits.maxTokens - this.usage.inputTokens - this.usage.outputTokens
    if (this.counts[input.kind] >= maximum || remainingTokens <= 0) {
      throw new AgentError('BUDGET_EXCEEDED', 'Task tree budget exceeded', 'limit_exceeded')
    }
    this.counts[input.kind]++
    return Math.min(remainingTokens, input.limits.maxOutputTokens)
  }

  async account(input: { usage: Usage; limits: RunLimits }): Promise<Usage> {
    if (
      ![input.usage.inputTokens, input.usage.outputTokens].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    ) {
      throw new AgentError('INVALID_MODEL_RESPONSE', 'Invalid model usage')
    }
    this.usage.inputTokens += input.usage.inputTokens
    this.usage.outputTokens += input.usage.outputTokens
    if (this.usage.inputTokens + this.usage.outputTokens > input.limits.maxTokens) {
      throw new AgentError('BUDGET_EXCEEDED', 'Task tree token budget exceeded', 'limit_exceeded')
    }
    return this.snapshot()
  }

  acquire(signal: AbortSignal): Promise<() => void> {
    return this.options.gate.acquire(signal)
  }

  snapshot(): Usage {
    return { ...this.usage }
  }

  emit(event: AgentEvent): void {
    this.options.emit(event)
  }
}

/** 事件不默认携带业务输入、工具结果或底层异常。 */
export function emitEvent(
  scope: ExecutionScope,
  detail: Omit<AgentEvent, 'identity' | 'timestamp'>,
): void {
  scope.tree.emit({ ...detail, identity: scope.identity, timestamp: new Date().toISOString() })
}
