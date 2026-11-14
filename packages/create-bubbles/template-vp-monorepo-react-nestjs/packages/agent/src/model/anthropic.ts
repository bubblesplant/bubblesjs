import { z } from 'zod'
import type { Message, ModelAdapter } from '../core/types.ts'
import { endpoint, parseResponse, postJson, tokenCount } from './http.ts'
import type { HttpModelOptions } from './http.ts'

const responseSchema = z.object({
  content: z.array(
    z.union([
      z.object({ type: z.literal('text'), text: z.string() }),
      z.object({
        type: z.literal('tool_use'),
        id: z.string().min(1),
        name: z.string(),
        input: z.unknown(),
      }),
      // 兼容开启思考的模型，但不向事件或历史暴露内部推理。
      z.object({ type: z.enum(['thinking', 'redacted_thinking']) }),
    ]),
  ),
  usage: z.object({ input_tokens: tokenCount, output_tokens: tokenCount }),
  stop_reason: z.string().nullable().optional(),
})

/** 连续 tool result 合并为一个 user 消息，保持 Anthropic 工具回合配对。 */
function messagesForAnthropic(messages: readonly Message[]): Record<string, unknown>[] {
  const result: { role: string; content: unknown[] }[] = []
  for (const message of messages) {
    const role = message.role === 'assistant' ? 'assistant' : 'user'
    const content: unknown[] =
      message.role === 'tool'
        ? [
            {
              type: 'tool_result',
              tool_use_id: message.toolCallId,
              content: message.content,
              is_error: message.isError ?? false,
            },
          ]
        : [
            ...(message.content ? [{ type: 'text', text: message.content }] : []),
            ...(message.toolCalls ?? []).map((call) => ({
              type: 'tool_use',
              id: call.id,
              name: call.name,
              input: call.input,
            })),
          ]
    const previous = result.at(-1)
    if (previous?.role === role) previous.content.push(...content)
    else result.push({ role, content })
  }
  return result
}

/** 原生 Node fetch 的 Anthropic Messages 兼容适配器。 */
export function createAnthropicModel(
  options: HttpModelOptions & { auth?: 'api-key' | 'bearer' },
): ModelAdapter {
  const url = endpoint(options.baseUrl, 'messages')
  const headers = {
    'anthropic-version': '2023-06-01',
    ...options.headers,
    ...(options.auth === 'bearer'
      ? { authorization: `Bearer ${options.apiKey}` }
      : { 'x-api-key': options.apiKey }),
  }
  return Object.freeze({
    id: options.model,
    async generate(request) {
      const response = parseResponse(
        responseSchema,
        await postJson({
          url,
          headers,
          signal: request.signal,
          fetch: options.fetch ?? globalThis.fetch,
          body: {
            model: options.model,
            system: request.systemPrompt,
            messages: messagesForAnthropic(request.messages),
            max_tokens: request.maxOutputTokens,
            ...(request.tools.length
              ? {
                  tools: request.tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema,
                  })),
                }
              : {}),
          },
        }),
      )
      return {
        text: response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join(''),
        toolCalls: response.content
          .filter((block) => block.type === 'tool_use')
          .map((block) => ({ id: block.id, name: block.name, input: block.input })),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        finishReason:
          response.stop_reason === 'max_tokens' ? ('length' as const) : ('stop' as const),
      }
    },
  } satisfies ModelAdapter)
}
