import type {
  AgentDefinition,
  AgentEvent,
  AuthorizationRequest,
  Message,
  ProcessAgentSpec,
  RunIdentity,
  RunLimits,
  Usage,
} from '../core/types.ts'
import type { BudgetKind, ExecutionOutcome } from '../runtime/tree.ts'

export interface WireError {
  code: string
  message: string
  status: 'failed' | 'cancelled' | 'limit_exceeded'
}

export type ControlPayload =
  | { action: 'reserve'; kind: BudgetKind; limits: RunLimits }
  | { action: 'account'; usage: Usage; limits: RunLimits }
  | { action: 'acquire' }
  | { action: 'release'; lease: string }
  | { action: 'authorize'; request: AuthorizationRequest }

export type WorkerInbound =
  | { type: 'shutdown' }
  | { type: 'init'; spec: ProcessAgentSpec }
  | {
      type: 'execute'
      runId: string
      identity: RunIdentity
      submittedAt: number
      messages: Message[]
      limits: RunLimits
    }
  | { type: 'control.result'; id: string; value?: unknown; error?: WireError }
  | { type: 'cancel'; runId: string }

export type WorkerOutbound =
  | { type: 'ready' }
  | { type: 'fatal'; error: WireError }
  | { type: 'result'; runId: string; outcome?: ExecutionOutcome; error?: WireError }
  | { type: 'control'; id: string; runId: string; payload: ControlPayload }
  | { type: 'event'; runId: string; event: AgentEvent }

export type ProcessFactory = (
  config: ProcessAgentSpec['config'],
) => AgentDefinition | Promise<AgentDefinition>
