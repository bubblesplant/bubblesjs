import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { createAnthropicModel, createOpenAIModel } from 'agent'
import type { ModelRequest } from 'agent'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()))
})

/** 使用真实本机 HTTP 传输验证网关路径、认证和工具协议，不连接外部模型。 */
async function server(response: { status?: number; body: unknown }) {
  const requests: {
    path?: string
    headers: Record<string, unknown>
    body: Record<string, unknown>
  }[] = []
  const http = createServer(async (request, reply) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    requests.push({
      path: request.url,
      headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    })
    reply.writeHead(response.status ?? 200, { 'content-type': 'application/json' })
    reply.end(JSON.stringify(response.body))
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) => {
        http.close((error) => (error ? reject(error) : resolve()))
        http.closeAllConnections()
      }),
  )
  return { baseUrl: `http://127.0.0.1:${(http.address() as AddressInfo).port}`, requests }
}

const request: ModelRequest = {
  systemPrompt: 'system',
  signal: new AbortController().signal,
  maxOutputTokens: 100,
  tools: [{ name: 'add', description: 'add', inputSchema: { type: 'object' } }],
  messages: [
    { role: 'user', content: 'calculate' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'one', name: 'add', input: { a: 1 } },
        { id: 'two', name: 'add', input: { a: 2 } },
      ],
    },
    { role: 'tool', content: '1', toolCallId: 'one' },
    { role: 'tool', content: '2', toolCallId: 'two' },
  ],
}

describe('HTTP 模型协议', () => {
  it('Anthropic 保留网关前缀、合并工具结果并忽略内部思考内容', async () => {
    const mock = await server({
      body: {
        content: [
          { type: 'thinking', thinking: 'private reasoning' },
          { type: 'text', text: 'answer' },
          { type: 'tool_use', id: 'next', name: 'add', input: { a: 3 } },
        ],
        usage: { input_tokens: 10, output_tokens: 2 },
        stop_reason: 'tool_use',
      },
    })
    const model = createAnthropicModel({
      baseUrl: `${mock.baseUrl}/gateway/anthropic`,
      apiKey: 'test-key',
      model: 'mock',
    })
    const result = await model.generate(request)
    expect(mock.requests[0]!.path).toBe('/gateway/anthropic/v1/messages')
    expect(mock.requests[0]!.headers['x-api-key']).toBe('test-key')
    expect(mock.requests[0]!.headers['anthropic-version']).toBe('2023-06-01')
    expect(mock.requests[0]!.body.messages).toHaveLength(3)
    expect((mock.requests[0]!.body.messages as { content: unknown[] }[])[2]!.content).toHaveLength(
      2,
    )
    expect(result.text).toBe('answer')
    expect(result.toolCalls).toEqual([{ id: 'next', name: 'add', input: { a: 3 } }])
    expect(JSON.stringify(result)).not.toContain('private reasoning')
  })

  it('支持完整 messages 路径与显式 bearer 网关认证', async () => {
    const mock = await server({
      body: {
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    })
    const model = createAnthropicModel({
      baseUrl: `${mock.baseUrl}/custom/messages`,
      auth: 'bearer',
      model: 'mock',
      apiKey: 'test-key',
    })
    await model.generate(request)
    expect(mock.requests[0]!.path).toBe('/custom/messages')
    expect(mock.requests[0]!.headers.authorization).toBe('Bearer test-key')
  })

  it('OpenAI 保留工具 ID 并正确解析参数与用量', async () => {
    const mock = await server({
      body: {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'next', type: 'function', function: { name: 'add', arguments: '{"a":3}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 7, completion_tokens: 3 },
      },
    })
    const result = await createOpenAIModel({
      baseUrl: `${mock.baseUrl}/v1`,
      apiKey: 'test-key',
      model: 'mock',
    }).generate(request)
    expect(mock.requests[0]!.path).toBe('/v1/chat/completions')
    expect(mock.requests[0]!.headers.authorization).toBe('Bearer test-key')
    expect((mock.requests[0]!.body.messages as Record<string, unknown>[])[3]!.tool_call_id).toBe(
      'one',
    )
    expect(result.toolCalls?.[0]!.input).toEqual({ a: 3 })
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 3 })
  })

  it('协议无效或 HTTP 出错不回显远端敏感正文', async () => {
    for (const response of [
      { body: { secret: 'DO-NOT-REFLECT' } },
      { status: 401, body: { error: 'DO-NOT-REFLECT' } },
    ]) {
      const mock = await server(response)
      const model = createAnthropicModel({
        baseUrl: mock.baseUrl,
        model: 'mock',
        apiKey: 'test-key',
      })
      let failure: unknown
      try {
        await model.generate(request)
      } catch (error) {
        failure = error
      }
      expect(String(failure)).not.toContain('DO-NOT-REFLECT')
      expect(failure).toMatchObject({
        code: response.status ? 'MODEL_HTTP_ERROR' : 'INVALID_MODEL_RESPONSE',
      })
    }
  })
})
