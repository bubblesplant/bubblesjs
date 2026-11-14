import { bootstrapAgent, currentAgentContext, defineTool } from 'agent'
import { z } from 'zod'

/** worker 工厂用运行期环境重建能力，不接受模型客户端或函数的序列化。 */
export default function createDefinition(config = {}) {
  return {
    name: 'worker',
    systemPrompt: '',
    limits: config.limits,
    dispose: () => {
      if (config.disposeFail) throw new Error('private cleanup details')
    },
    model: {
      id: 'worker-test',
      async generate(request) {
        if (config.crash) process.exit(7)
        if (config.delay) await new Promise((resolve) => setTimeout(resolve, config.delay))
        const last = request.messages.at(-1)
        return {
          text: last.role === 'tool' ? last.content : '',
          toolCalls:
            last.role === 'tool'
              ? []
              : [
                  {
                    id: 'call',
                    name: config.nested ? 'delegate_agent' : 'identify',
                    input: config.nested ? { agent: 'nested', input: 'identify' } : {},
                  },
                ],
          usage: { inputTokens: 2, outputTokens: 1 },
        }
      },
    },
    tools: [
      defineTool({
        name: 'identify',
        description: 'worker identity',
        schema: z.object({}),
        execute: () => ({
          pid: process.pid,
          context: currentAgentContext(),
          entry: typeof bootstrapAgent,
        }),
      }),
    ],
    ...(config.nested
      ? {
          subagents: {
            nested: {
              kind: 'process',
              name: 'nested',
              module: import.meta.url,
              config: { nested: Number(config.nested) - 1 },
            },
          },
        }
      : {}),
  }
}
