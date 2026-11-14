import { afterEach, describe, expect, it } from 'vite-plus/test'
import { bootstrapAgent, createAgentHost } from 'agent'
import type { AgentHost, AgentInstance, ProcessAgentSpec } from 'agent'

const resources: (AgentHost | AgentInstance)[] = []
afterEach(async () => {
  await Promise.all(resources.splice(0).map((resource) => resource.close()))
})
const spec: ProcessAgentSpec = {
  kind: 'process',
  name: 'worker',
  module: new URL('./fixture.mjs', import.meta.url).href,
}

describe('独立进程复用统一入口', () => {
  it('真实 worker 执行工具、隔离 pid、复用进程并保持 session 历史', async () => {
    const agent = await bootstrapAgent({ definition: spec })
    resources.push(agent)
    const first = await agent.run({ input: 'identity', sessionId: 'worker' })
    expect(first.status).toBe('completed')
    const identity = JSON.parse(first.output)
    expect(identity.pid).not.toBe(process.pid)
    expect(identity.context.runId).toBe(first.identity.runId)
    expect(identity.entry).toBe('function')
    const second = await agent.run({ input: 'again', sessionId: 'worker' })
    expect(JSON.parse(second.output).pid).toBe(identity.pid)
    expect(agent.history('worker')).toHaveLength(8)
    await agent.close()
    expect(() => process.kill(identity.pid, 0)).toThrow()
  })

  it('跨两层进程共享预算与单个模型名额，不会等待死锁', async () => {
    const host = createAgentHost({ maxConcurrentModels: 1 })
    resources.push(host)
    const agent = await bootstrapAgent({ host, definition: { ...spec, config: { nested: true } } })
    const result = await agent.run({ input: 'nested' })
    expect(result.status).toBe('completed')
    const nested = JSON.parse(result.output)
    expect(nested.status).toBe('completed')
    expect(JSON.parse(nested.output).context.depth).toBe(1)
    expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 4 })
    const limited = await agent.run({ input: 'limited', limits: { maxModelCalls: 2 } })
    expect(limited.status).toBe('limit_exceeded')
    expect(limited.error?.code).toBe('BUDGET_EXCEEDED')
  })

  it('祖先授权限制和深度限制跨进程生效', async () => {
    const host = createAgentHost({ authorize: (request) => request.toolName !== 'identify' })
    resources.push(host)
    const agent = await bootstrapAgent({ host, definition: spec })
    const denied = await agent.run({ input: 'denied' })
    expect(denied.status).toBe('completed')
    expect(denied.output).toContain('TOOL_DENIED')
    expect(denied.output).not.toContain('pid')
    const nested = await bootstrapAgent({ host, definition: { ...spec, config: { nested: true } } })
    expect((await nested.run({ input: 'depth', limits: { maxDepth: 1 } })).status).toBe('completed')
  })

  it('取消后 worker 可继续独立任务，关闭确实回收进程', async () => {
    const agent = await bootstrapAgent({ definition: { ...spec, config: { delay: 40 } } })
    resources.push(agent)
    const controller = new AbortController()
    const pending = agent.run({ input: 'cancel', signal: controller.signal })
    setTimeout(() => controller.abort(), 30)
    expect((await pending).status).toBe('cancelled')
    const result = await agent.run({ input: 'next' })
    expect(result.status).toBe('completed')
    const pid = JSON.parse(result.output).pid
    await agent.close()
    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('工厂失败与进程崩溃返回确定错误', async () => {
    for (const definition of [
      { ...spec, exportName: 'missing' },
      { ...spec, config: { crash: true } },
    ]) {
      const agent = await bootstrapAgent({ definition })
      resources.push(agent)
      const result = await agent.run({ input: 'fail' })
      expect(result.status).toBe('failed')
      expect(['INVALID_CONFIG', 'WORKER_EXITED']).toContain(result.error?.code)
    }
  })

  it('worker 自身更短的总期限和跨进程深度边界生效', async () => {
    const timed = await bootstrapAgent({
      definition: { ...spec, config: { delay: 100, limits: { timeoutMs: 20 } } },
    })
    resources.push(timed)
    expect((await timed.run({ input: 'timeout' })).error?.code).toBe('TIMEOUT')
    const nested = await bootstrapAgent({ definition: { ...spec, config: { nested: 2 } } })
    resources.push(nested)
    expect((await nested.run({ input: 'depth', limits: { maxDepth: 1 } })).error?.code).toBe(
      'DEPTH_EXCEEDED',
    )
  })

  it('worker 清理钩子失败会报告，进程依然被回收', async () => {
    const agent = await bootstrapAgent({ definition: { ...spec, config: { disposeFail: true } } })
    const result = await agent.run({ input: 'identity' })
    expect(result.status).toBe('completed')
    const pid = JSON.parse(result.output).pid
    await expect(agent.close()).rejects.toMatchObject({
      code: 'CLOSE_FAILED',
      message: 'Agent resource cleanup failed',
    })
    expect(() => process.kill(pid, 0)).toThrow()
  })
})
