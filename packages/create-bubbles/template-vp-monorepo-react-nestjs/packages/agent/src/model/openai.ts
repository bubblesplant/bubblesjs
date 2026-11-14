import { z } from 'zod'
import type { Message, ModelAdapter } from '../core/types.ts'
import { endpoint, parseResponse, postJson, tokenCount } from './http.ts'
import type { HttpModelOptions } from './http.ts'

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().min(1),
                type: z.literal('function'),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .optional(),
        }),
        finish_reason: z.string().nullable(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: tokenCount, completion_tokens: tokenCount }),
})

/** 将中立消息转为 Chat Completions function calling 格式。 */
function messagesForOpenAI(messages: readonly Message[]): Record<string, unknown>[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content || (message.role === 'assistant' ? null : ''),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls?.length
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.input) },
          })),
        }
      : {}),
  }))
}

/** OpenAI Chat Completions 文本与函数工具兼容适配器。 */
export function createOpenAIModel(options: HttpModelOptions): ModelAdapter {
  const url = endpoint(options.baseUrl, 'chat/completions')
  return Object.freeze({
    id: options.model,
    async generate(request) {
      const response = parseResponse(
        responseSchema,
        await postJson({
          url,
          signal: request.signal,
          fetch: options.fetch ?? globalThis.fetch,
          headers: { ...options.headers, authorization: `Bearer ${options.apiKey}` },
          body: {
            model: options.model,
            max_tokens: request.maxOutputTokens,
            messages: [
              { role: 'system', content: request.systemPrompt },
              ...messagesForOpenAI(request.messages),
            ],
            ...(request.tools.length
              ? {
                  tools: request.tools.map((tool) => ({
                    type: 'function',
                    function: {
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.inputSchema,
                    },
                  })),
                }
              : {}),
          },
        }),
      )
      const choice = response.choices[0]!
      return {
        text: choice.message.content ?? '',
        toolCalls: (choice.message.tool_calls ?? []).map((call) => {
          let input: unknown
          try {
            input = JSON.parse(call.function.arguments)
          } catch {
            input = null
          }
          return { id: call.id, name: call.function.name, input }
        }),
        usage: {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        },
        finishReason: choice.finish_reason === 'length' ? ('length' as const) : ('stop' as const),
      }
    },
  } satisfies ModelAdapter)
}
