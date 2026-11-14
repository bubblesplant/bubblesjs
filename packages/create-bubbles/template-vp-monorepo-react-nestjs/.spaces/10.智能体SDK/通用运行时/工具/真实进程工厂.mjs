import { createAnthropicModel, defineTool } from '../../../../packages/agent/dist/index.mjs'
import { createRequire } from 'node:module'

const { z } = createRequire(new URL('../../../../packages/agent/package.json', import.meta.url))(
  'zod',
)

/** 每个 worker 从环境重建模型和工具；配置和 IPC 中不携带密钥。 */
export default function createDefinition() {
  return {
    name: 'process-calculator',
    systemPrompt: '你是计算助手。必须调用 add 工具计算，得到结果后只回复数值。',
    model: createAnthropicModel({
      baseUrl: process.env.AGENT_BASE_URL,
      model: process.env.AGENT_MODEL,
      apiKey: process.env.AGENT_API_KEY,
      auth: process.env.AGENT_AUTH === 'bearer' ? 'bearer' : 'api-key',
    }),
    tools: [
      defineTool({
        name: 'add',
        description: '计算两个整数的和',
        schema: z.object({ a: z.number().int(), b: z.number().int() }).strict(),
        execute: ({ a, b }) => ({ sum: a + b, pid: process.pid }),
      }),
    ],
  }
}
