import { z } from 'zod'
import { AgentError } from '../core/control.ts'
import type { AgentTool, ToolContext } from '../core/types.ts'

/** 在可信宿主定义工具，模型声明与实际校验共用同一个 schema。 */
export function defineTool<S extends z.ZodType>(options: {
  name: string
  description: string
  schema: S
  execute: (input: z.output<S>, context: ToolContext) => unknown
  timeoutMs?: number
}): AgentTool {
  const inputSchema = z.toJSONSchema(options.schema, { io: 'input' })
  const timeoutMs = options.timeoutMs ?? 30_000
  if (!/^[\w-]{1,64}$/.test(options.name) || inputSchema.type !== 'object') {
    throw new AgentError('INVALID_CONFIG', 'Tool requires a valid name and object schema')
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new AgentError('INVALID_CONFIG', 'Invalid tool timeout')
  }
  return Object.freeze({
    name: options.name,
    description: options.description,
    inputSchema,
    timeoutMs,
    parse: (input: unknown) => {
      const parsed = options.schema.safeParse(input)
      if (!parsed.success) throw new AgentError('INVALID_TOOL_INPUT', 'Invalid tool arguments')
      return parsed.data
    },
    execute: (input: unknown, context: ToolContext) =>
      options.execute(input as z.output<S>, context),
  })
}
