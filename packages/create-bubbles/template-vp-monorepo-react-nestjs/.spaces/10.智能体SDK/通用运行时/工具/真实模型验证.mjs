import { mkdir, writeFile } from 'node:fs/promises'
import {
  bootstrapAgent,
  createAgentHost,
  createAnthropicModel,
  defineTool,
} from '../../../../packages/agent/dist/index.mjs'
import { createRequire } from 'node:module'

const { z } = createRequire(new URL('../../../../packages/agent/package.json', import.meta.url))(
  'zod',
)

/** 仅从运行环境接收凭证，证据保存结果与计数，不输出请求头或密钥。 */
async function main() {
  if (!process.env.AGENT_API_KEY) throw new Error('AGENT_API_KEY is required')
  const events = []
  const host = createAgentHost({ maxConcurrentModels: 2, onEvent: (event) => events.push(event) })
  const model = createAnthropicModel({
    baseUrl: process.env.AGENT_BASE_URL,
    model: process.env.AGENT_MODEL,
    apiKey: process.env.AGENT_API_KEY,
    auth: process.env.AGENT_AUTH === 'bearer' ? 'bearer' : 'api-key',
  })
  const evidence = {
    date: new Date().toISOString(),
    model: process.env.AGENT_MODEL,
    baseUrl: process.env.AGENT_BASE_URL,
    auth: process.env.AGENT_AUTH ?? 'api-key',
    scenarios: [],
    passed: false,
  }
  const started = Date.now()
  try {
    const conversation = await bootstrapAgent({
      host,
      definition: { name: 'conversation', systemPrompt: '严格遵循用户要求，简短回复。', model },
    })
    const ping = await conversation.run({
      input: '只回复 PONG，不要解释。',
      limits: { maxOutputTokens: 1024 },
    })
    evidence.scenarios.push({
      name: 'conversation',
      status: ping.status,
      passed: ping.status === 'completed' && ping.output.includes('PONG'),
      output: ping.output,
      usage: ping.usage,
      error: ping.error,
    })
    if (ping.status !== 'completed') return

    let sumExecutions = 0
    const calculator = await bootstrapAgent({
      host,
      definition: {
        name: 'local-calculator',
        systemPrompt: '必须调用 add 工具计算，然后只回复数值。',
        model,
        tools: [
          defineTool({
            name: 'add',
            description: '计算两个整数的和',
            schema: z.object({ a: z.number().int(), b: z.number().int() }).strict(),
            execute: ({ a, b }) => {
              sumExecutions++
              return { sum: a + b }
            },
          }),
        ],
      },
    })
    const local = await calculator.run({ input: '使用 add 计算 17 + 25。' })
    evidence.scenarios.push({
      name: 'local-tool',
      status: local.status,
      passed: local.status === 'completed' && local.output.includes('42') && sumExecutions === 1,
      executions: sumExecutions,
      output: local.output,
      usage: local.usage,
      error: local.error,
    })

    const parent = await bootstrapAgent({
      host,
      definition: {
        name: 'parent',
        model,
        systemPrompt:
          '必须调用 delegate_agent 将计算任务交给 worker，禁止自行计算。得到子代理结果后只回复计算数值。',
        subagents: {
          worker: {
            kind: 'process',
            name: 'process-calculator',
            module: new URL('./真实进程工厂.mjs', import.meta.url).href,
          },
        },
      },
    })
    const remote = await parent.run({ input: '让 worker 使用 add 计算 17 + 25。' })
    const workerTool = events.some(
      (event) =>
        event.type === 'tool.completed' &&
        event.toolName === 'add' &&
        event.identity.parentRunId === remote.identity.runId,
    )
    evidence.scenarios.push({
      name: 'process-subagent',
      status: remote.status,
      passed: remote.status === 'completed' && remote.output.includes('42') && workerTool,
      workerTool,
      output: remote.output,
      usage: remote.usage,
      error: remote.error,
    })
    evidence.passed =
      evidence.scenarios.length === 3 && evidence.scenarios.every((scenario) => scenario.passed)
  } finally {
    await host.close()
    evidence.durationMs = Date.now() - started
    evidence.modelRequests = events.filter((event) => event.type === 'model.started').length
    evidence.completedTools = events
      .filter((event) => event.type === 'tool.completed')
      .map((event) => ({
        tool: event.toolName,
        agent: event.identity.agentName,
        depth: event.identity.depth,
      }))
    const destination = new URL('../测试证据/', import.meta.url)
    await mkdir(destination, { recursive: true })
    await writeFile(new URL('真实模型.json', destination), JSON.stringify(evidence, null, 2) + '\n')
    console.log(JSON.stringify(evidence, null, 2))
    if (!evidence.passed) process.exitCode = 1
  }
}

await main()
