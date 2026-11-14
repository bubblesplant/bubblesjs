import { afterEach, describe, expect, it } from 'vite-plus/test'
import { z } from 'zod'
import {
  AgentError,
  ModelHttpError,
  bootstrapAgent,
  createAgentHost,
  currentAgentContext,
  defineTool,
} from 'agent'
import type {
  AgentDefinition,
  AgentEvent,
  AgentInstance,
  ModelAdapter,
  ModelRequest,
  ModelResponse,
} from 'agent'

const resources: { close: () => Promise<void> }[] = []
afterEach(async () => {
  await Promise.all(resources.splice(0).map((resource) => resource.close()))
})

/** 保证失败的测试也会关闭实例。 */
async function makeAgent(definition: AgentDefinition): Promise<AgentInstance> {
  const agent = await bootstrapAgent({ definition })
  resources.push(agent)
  return agent
}

/** 用确定性适配器控制工具回合与故障位置。 */
function model(
  generate: (request: ModelRequest) => ModelResponse | Promise<ModelResponse>,
): ModelAdapter {
  return { id: 'test', generate: async (request) => generate(request) }
}

const usage = { inputTokens: 2, outputTokens: 1 }
const final = (text: string): ModelResponse => ({ text, usage })
const tool = (name: string, input: unknown): ModelResponse => ({
  text: '',
  usage,
  toolCalls: [{ id: 'call', name, input }],
})
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('统一运行内核', () => {
  it('校验真实参数、执行工具并提交可隔离的成功历史', async () => {
    let executions = 0
    const agent = await makeAgent({
      name: 'calculator',
      systemPrompt: 'calculate',
      model: model((request) =>
        request.messages.at(-1)?.role === 'tool'
          ? final(request.messages.at(-1)!.content)
          : tool('add', { a: 17, b: 25 }),
      ),
      tools: [
        defineTool({
          name: 'add',
          description: 'add',
          schema: z.object({ a: z.number(), b: z.number() }).strict(),
          execute: ({ a, b }) => {
            executions++
            return { sum: a + b }
          },
        }),
      ],
    })
    const result = await agent.run({ input: 'sum', sessionId: 'one' })
    expect(result.status).toBe('completed')
    expect(JSON.parse(result.output)).toEqual({ sum: 42 })
    expect(executions).toBe(1)
    const history = agent.history('one')
    history[0]!.content = 'mutated'
    expect(agent.history('one')[0]!.content).toBe('sum')
    expect(agent.history('two')).toEqual([])
  })

  it('参数错误和权限拒绝不会执行工具或泄露底层异常', async () => {
    let executions = 0
    for (const input of [{ value: 'bad' }, { value: 2 }]) {
      const agent = await makeAgent({
        name: 'guarded',
        systemPrompt: '',
        authorize: () => false,
        model: model((request) =>
          request.messages.at(-1)?.role === 'tool'
            ? final(request.messages.at(-1)!.content)
            : tool('write', input),
        ),
        tools: [
          defineTool({
            name: 'write',
            description: '',
            schema: z.object({ value: z.number() }),
            execute: () => {
              executions++
              throw new Error('private upstream credential')
            },
          }),
        ],
      })
      const result = await agent.run({ input: 'write' })
      expect(result.status).toBe('completed')
      expect(result.output).toContain(
        typeof input.value === 'string' ? 'INVALID_TOOL_INPUT' : 'TOOL_DENIED',
      )
      expect(result.output).not.toContain('private')
    }
    expect(executions).toBe(0)
  })

  it('工具完成后 fallback 只重发当前请求，不重复副作用', async () => {
    let writes = 0
    const agent = await makeAgent({
      name: 'fallback',
      systemPrompt: '',
      model: model((request) => {
        if (request.messages.at(-1)?.role === 'tool') throw new ModelHttpError(503)
        return tool('write', {})
      }),
      fallbacks: [model((request) => final(request.messages.at(-1)!.content))],
      tools: [
        defineTool({
          name: 'write',
          description: '',
          schema: z.object({}),
          execute: () => {
            writes++
            return 'saved'
          },
        }),
      ],
    })
    const result = await agent.run({ input: 'save' })
    expect(result.status).toBe('completed')
    expect(result.output).toBe('"saved"')
    expect(writes).toBe(1)
  })

  it('认证错误不切换备用模型，失败不提交历史', async () => {
    let fallbackCalls = 0
    const agent = await makeAgent({
      name: 'auth',
      systemPrompt: '',
      model: model(() => {
        throw new ModelHttpError(401)
      }),
      fallbacks: [
        model(() => {
          fallbackCalls++
          return final('unexpected')
        }),
      ],
    })
    const result = await agent.run({ input: 'hello', sessionId: 'auth' })
    expect(result.error?.code).toBe('MODEL_HTTP_ERROR')
    expect(fallbackCalls).toBe(0)
    expect(agent.history('auth')).toEqual([])
  })

  it('并发异步链的身份隔离，会话内顺序执行', async () => {
    const observed: string[] = []
    const agent = await makeAgent({
      name: 'context',
      systemPrompt: '',
      model: model(async (request) => {
        const before = currentAgentContext()!
        await wait(15)
        expect(currentAgentContext()).toBe(before)
        observed.push(`${before.sessionId}:${request.messages.length}`)
        return final(before.sessionId)
      }),
    })
    const results = await Promise.all([
      agent.run({ input: 'a', sessionId: 'a' }),
      agent.run({ input: 'b', sessionId: 'b' }),
      agent.run({ input: 'a2', sessionId: 'a' }),
    ])
    expect(results.map((result) => result.output)).toEqual(['a', 'b', 'a'])
    expect(observed).toContain('a:3')
    expect(currentAgentContext()).toBeUndefined()
  })

  it('排队期间取消不会越过活跃会话，且不污染历史', async () => {
    const agent = await makeAgent({
      name: 'queue',
      systemPrompt: '',
      model: model(async (request) => {
        await wait(35)
        return final(request.messages.at(-1)!.content)
      }),
    })
    const first = agent.run({ input: 'first', sessionId: 'shared' })
    const controller = new AbortController()
    const cancelled = agent.run({
      input: 'cancelled',
      sessionId: 'shared',
      signal: controller.signal,
    })
    const third = agent.run({ input: 'third', sessionId: 'shared' })
    expect(() => agent.clearSession('shared')).toThrow(AgentError)
    controller.abort()
    expect((await cancelled).status).toBe('cancelled')
    expect((await first).output).toBe('first')
    expect((await third).output).toBe('third')
    expect(agent.history('shared').map((message) => message.content)).toEqual([
      'first',
      'first',
      'third',
      'third',
    ])
    agent.clearSession('shared')
    expect(agent.history('shared')).toEqual([])
  })

  it('单模型名额下并行子代理无死锁，借入实例不会被父关闭', async () => {
    const events: AgentEvent[] = []
    const host = createAgentHost({
      maxConcurrentModels: 1,
      onEvent: (event) => {
        events.push(event)
      },
    })
    resources.push(host)
    const borrowed = await bootstrapAgent({
      host,
      definition: {
        name: 'child',
        systemPrompt: '',
        model: model((request) => final(request.messages[0]!.content)),
      },
    })
    const parent = await bootstrapAgent({
      host,
      definition: {
        name: 'parent',
        systemPrompt: '',
        subagents: { child: borrowed },
        model: model((request) =>
          request.messages.at(-1)?.role === 'tool'
            ? final(request.messages.at(-1)!.content)
            : tool('parallel', {}),
        ),
        tools: [
          defineTool({
            name: 'parallel',
            description: '',
            schema: z.object({}),
            execute: async (_, context) =>
              Promise.all(['a', 'b'].map((input) => context.delegate({ agent: 'child', input }))),
          }),
        ],
      },
    })
    const result = await parent.run({ input: 'parallel' })
    expect(result.status).toBe('completed')
    const children = JSON.parse(result.output) as RunResultLike[]
    expect(children.map((child) => child.output)).toEqual(['a', 'b'])
    expect(
      events.filter(
        (event) =>
          event.type === 'run.started' && event.identity.parentRunId === result.identity.runId,
      ),
    ).toHaveLength(2)
    await parent.close()
    expect((await borrowed.run({ input: 'still usable' })).output).toBe('still usable')
  })

  it('预算覆盖整树，父取消传播而其他独立 run 继续', async () => {
    const child: AgentDefinition = {
      name: 'child',
      systemPrompt: '',
      model: model(async () => {
        await wait(60)
        return final('child')
      }),
    }
    const agent = await makeAgent({
      name: 'parent',
      systemPrompt: '',
      subagents: { child },
      model: model((request) => {
        if (request.messages[0]!.content === 'independent') return final('ok')
        return request.messages.at(-1)?.role === 'tool'
          ? final('done')
          : tool('delegate_agent', { agent: 'child', input: 'task' })
      }),
    })
    const budget = await agent.run({ input: 'delegate', limits: { maxModelCalls: 1 } })
    expect(budget.status).toBe('limit_exceeded')
    const controller = new AbortController()
    const cancelled = agent.run({ input: 'delegate', signal: controller.signal })
    const independent = agent.run({ input: 'independent' })
    await wait(15)
    controller.abort()
    expect((await cancelled).status).toBe('cancelled')
    expect((await independent).output).toBe('ok')
    expect((await agent.run({ input: 'delegate' })).status).toBe('completed')
  })

  it('超时停止等待不配合取消的工具，错误结果安全返回', async () => {
    const agent = await makeAgent({
      name: 'timeout',
      systemPrompt: '',
      model: model((request) =>
        request.messages.at(-1)?.role === 'tool'
          ? final(request.messages.at(-1)!.content)
          : tool('hang', {}),
      ),
      tools: [
        defineTool({
          name: 'hang',
          description: '',
          timeoutMs: 15,
          schema: z.object({}),
          execute: () => new Promise(() => undefined),
        }),
      ],
    })
    const result = await agent.run({ input: 'hang' })
    expect(result.status).toBe('completed')
    expect(result.output).toContain('TOOL_TIMEOUT')
  })

  it('步骤、token 和总超时均有确定终态', async () => {
    const repeating = await makeAgent({
      name: 'repeat',
      systemPrompt: '',
      model: model(() => tool('noop', {})),
      tools: [
        defineTool({ name: 'noop', description: '', schema: z.object({}), execute: () => null }),
      ],
    })
    expect((await repeating.run({ input: 'loop', limits: { maxSteps: 1 } })).error?.code).toBe(
      'STEPS_EXCEEDED',
    )
    expect((await repeating.run({ input: 'tokens', limits: { maxTokens: 1 } })).status).toBe(
      'limit_exceeded',
    )
    const hanging = await makeAgent({
      name: 'hanging',
      systemPrompt: '',
      model: model(() => new Promise(() => undefined)),
    })
    expect((await hanging.run({ input: 'wait', limits: { timeoutMs: 15 } })).error?.code).toBe(
      'TIMEOUT',
    )
  })

  it('初始化期间关闭仍回收延迟工厂的资源', async () => {
    let disposeCount = 0
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    let finish!: () => void
    const initialization = new Promise<void>((resolve) => {
      finish = resolve
    })
    const agent = await makeAgent({
      name: 'parent',
      systemPrompt: '',
      model: model(() => tool('delegate_agent', { agent: 'late', input: 'task' })),
      subagents: {
        late: async () => {
          started()
          await initialization
          return {
            name: 'late',
            systemPrompt: '',
            model: model(() => final('late')),
            dispose: () => {
              disposeCount++
            },
          }
        },
      },
    })
    const running = agent.run({ input: 'start' })
    await ready
    await agent.close()
    finish()
    expect((await running).status).toBe('cancelled')
    await wait(10)
    expect(disposeCount).toBe(1)
    await expect(agent.run({ input: 'closed' })).rejects.toMatchObject({ code: 'AGENT_CLOSED' })
  })
})

interface RunResultLike {
  output: string
}
