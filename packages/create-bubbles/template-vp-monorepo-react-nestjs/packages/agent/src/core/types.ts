import type { AgentInstance, AgentHost } from '../runtime/agent.ts'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

export interface Message {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string
  isError?: boolean
}

export interface ToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ModelRequest {
  systemPrompt: string
  messages: readonly Message[]
  tools: readonly ToolSpec[]
  maxOutputTokens: number
  signal: AbortSignal
}

export interface ModelResponse {
  text: string
  toolCalls?: ToolCall[]
  usage: Usage
  finishReason?: 'stop' | 'length'
}

export interface ModelAdapter {
  readonly id: string
  generate: (request: ModelRequest) => Promise<ModelResponse>
}

export interface RunIdentity {
  readonly agentId: string
  readonly agentName: string
  readonly runId: string
  readonly sessionId: string
  readonly parentRunId?: string
  readonly depth: number
}

export interface RunLimits {
  timeoutMs: number
  maxSteps: number
  maxModelCalls: number
  maxToolCalls: number
  maxSubagents: number
  maxDepth: number
  maxTokens: number
  maxOutputTokens: number
}

export type RunStatus = 'completed' | 'failed' | 'cancelled' | 'limit_exceeded'

export interface RunResult {
  identity: RunIdentity
  status: RunStatus
  output: string
  usage: Usage
  error?: { code: string; message: string }
}

export interface RunInput {
  input: string
  sessionId?: string
  signal?: AbortSignal
  limits?: Partial<RunLimits>
}

export interface DelegateInput {
  agent: string
  input: string
}

export interface ToolContext {
  readonly identity: RunIdentity
  readonly signal: AbortSignal
  delegate: (input: DelegateInput) => Promise<RunResult>
}

export interface AgentTool extends ToolSpec {
  parse: (input: unknown) => unknown
  execute: (input: unknown, context: ToolContext) => unknown
  timeoutMs: number
}

export interface AuthorizationRequest {
  identity: RunIdentity
  toolName: string
  input: unknown
}

export type Authorize = (request: AuthorizationRequest) => boolean | Promise<boolean>

export interface AgentDefinition {
  name: string
  systemPrompt: string
  model: ModelAdapter
  fallbacks?: readonly ModelAdapter[]
  tools?: readonly AgentTool[]
  subagents?: Readonly<Record<string, AgentSource>>
  limits?: Partial<RunLimits>
  authorize?: Authorize
  dispose?: () => void | Promise<void>
}

export interface ProcessAgentSpec {
  kind: 'process'
  name: string
  /** 可信模块绝对路径或 file URL；凭证在工厂中从环境读取。 */
  module: string
  exportName?: string
  config?: JsonValue
}

export type AgentFactory = () => AgentDefinition | Promise<AgentDefinition>
export type AgentSource = AgentDefinition | ProcessAgentSpec | AgentInstance | AgentFactory

export interface BootstrapOptions {
  definition: AgentDefinition | ProcessAgentSpec
  host?: AgentHost
}

export interface AgentEvent {
  type:
    | 'run.started'
    | 'run.completed'
    | 'run.failed'
    | 'run.cancelled'
    | 'model.started'
    | 'model.completed'
    | 'model.fallback'
    | 'tool.started'
    | 'tool.completed'
    | 'tool.failed'
    | 'agent.delegated'
  identity: RunIdentity
  timestamp: string
  modelId?: string
  toolName?: string
  childAgent?: string
  usage?: Usage
  code?: string
}

export interface HostOptions {
  maxConcurrentModels?: number
  onEvent?: (event: AgentEvent) => void
  authorize?: Authorize
}
