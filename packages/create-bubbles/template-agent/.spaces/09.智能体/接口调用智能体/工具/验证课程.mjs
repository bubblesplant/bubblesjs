import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { MemorySaver, Command } from '@langchain/langgraph'
import { createAgent } from 'langchain'
import { z } from 'zod'

const sourceRoot = resolve(process.argv[2])
const evidencePath = resolve(process.argv[3])
const targetRoot = dirname(fileURLToPath(import.meta.url))
const samples = join(targetRoot, 'scripts/agent-learning')
const results = []
const requests = []
const resources = []
const context = { tenantId: 'test-tenant', userId: 'test-user' }
let baseURL
let server
let usageIndex = 0

/** 逐项保存真实执行结果；失败继续收集，最后统一以非零码退出。 */
async function verify(name, fn) {
  const start = Date.now()
  try {
    await fn()
    results.push({ name, status: 'passed', durationMs: Date.now() - start })
    console.log('通过：' + name)
  } catch (error) {
    results.push({ name, status: 'failed', error: error.stack })
    console.error('失败：' + name + '\n' + error.stack)
  }
}

/** 只提取带文件标记的完整示例，不把配置片段误当独立模块。 */
async function extract() {
  const docs = [
    '学习教程.md',
    ...(await readdir(join(sourceRoot, '课程')))
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => '课程/' + name),
  ]
  const files = new Set()
  for (const doc of docs) {
    const source = await readFile(join(sourceRoot, doc), 'utf8')
    const blocks = source.matchAll(
      /<!-- file: ([^\r\n]+) -->\s*```[^\r\n]*\r?\n([\s\S]*?)\r?\n```/g,
    )
    for (const block of blocks) {
      assert(!block[1].includes('..'), '文件标记不得越界')
      const file = join(samples, block[1])
      assert(!files.has(file), '示例路径重复')
      files.add(file)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, block[2] + '\n')
    }
  }
  let checked = 0
  for (const file of files) {
    if (!file.endsWith('.mjs')) continue
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    checked++
  }
  assert.equal(checked, 28, '完整 JavaScript 示例提取数量变化，请检查文件标记与围栏')
  return checked
}

/** 脚本模型仍通过真实 BaseChatModel 和 LangGraph，行为确定且不访问外部服务。 */
class ScriptModel extends BaseChatModel {
  constructor(respond) {
    super({})
    this.respond = respond
  }

  _llmType() {
    return 'course-script-model'
  }

  bindTools() {
    return this
  }

  /** 将确定的回复包装成 LangChain ChatResult，保留消息与 usage 元数据。 */
  async _generate(messages, options) {
    const message = await this.respond(messages, options)
    return {
      generations: [{ text: typeof message.content === 'string' ? message.content : '', message }],
    }
  }
}

/** 创建含可统计用量的 AIMessage，保留工具 ID 的完整测试路径。 */
function ai(content = '', toolCalls = []) {
  return new AIMessage({
    content,
    tool_calls: toolCalls,
    usage_metadata: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  })
}

/** 生成 OpenAI 协议的调用请求，供两种实际适配器和封装验证使用。 */
function call(name, args, id = 'call-' + ++usageIndex) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } }
}

/** 固定的候选问题，用于验证输入校验、多个子代理交互与恢复。 */
function question() {
  return {
    question: '请选择报告类型',
    options: [
      { id: 'week', label: '周报' },
      { id: 'month', label: '月报' },
    ],
    allowText: true,
  }
}

/** 根据真实请求中的模型名和工具历史返回本地协议响应，不模拟模型推理质量。 */
function responseFor(body) {
  const lastUser = body.messages.findLastIndex((message) => message.role === 'user')
  const current = body.messages.slice(lastUser + 1)
  const done = current.filter((message) => message.role === 'tool')
  const system = body.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n')
  const toolResult = done.at(-1)?.content
  if (body.model === 'course9') {
    if (system.includes('将任务拆')) {
      const plan = {
        tasks: [
          { agentId: 'calculate', input: '计算 12 + 8' },
          { agentId: 'review', input: '检查报告 A 并询问类型' },
          { agentId: 'review', input: '检查报告 B 并询问类型' },
        ],
      }
      return body.tools?.length
        ? { tool_calls: [call(body.tools[0].function.name, plan)] }
        : { content: JSON.stringify(plan) }
    }
    if (system.includes('负责算术')) {
      return done.length ? { content: '合计20' } : { tool_calls: [call('add', { a: 12, b: 8 })] }
    }
    if (system.includes('检查报告')) {
      return done.length ? { content: '审查完成' } : { tool_calls: [call('ask_user', question())] }
    }
    return { content: '所有任务已汇总' }
  }
  if (body.model === 'parent') {
    return done.length
      ? { content: '父代理已收到全部结果' }
      : {
          tool_calls: [
            call('delegate_worker', { input: '任务A' }),
            call('delegate_worker', { input: '任务B' }),
          ],
        }
  }
  if (['ask', 'child'].includes(body.model)) {
    return done.length
      ? { content: '回答已收到：' + toolResult }
      : { tool_calls: [call('ask_user', question())] }
  }
  if (body.model === 'delegate-once') {
    return done.length
      ? { content: '已收到子结果' }
      : { tool_calls: [call('delegate_worker', { input: '计算' })] }
  }
  if (body.model === 'forever') return { tool_calls: [call('add', { a: 1, b: 2 })] }
  if (body.model === 'tool-loop') {
    if (!done.length) return { tool_calls: [call('add', { a: 12, b: 8 })] }
    if (done.length === 1) return { tool_calls: [call('multiply', { a: 20, b: 3 })] }
    return { content: '60' }
  }
  if (body.model === 'json') return { content: '{"summary":"本地结果","missing":[]}' }
  if (body.model === 'invalid-json') return { content: '这不是JSON' }
  return { content: '本地回复' }
}

/** 只监听回环地址，用虚构密钥测试 OpenAI 与 Anthropic 的真实 SDK 协议编码。 */
async function openServer() {
  server = createServer(async (request, response) => {
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      requests.push({ url: request.url, body })
      if (['unavailable', 'unauthorized'].includes(body.model)) {
        const status = body.model === 'unavailable' ? 503 : 401
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: '本地模拟错误', type: 'server_error' } }))
        return
      }
      if (body.model === 'slow') await new Promise((resolve) => setTimeout(resolve, 300))
      if (request.url.endsWith('/messages')) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            id: 'msg-local',
            type: 'message',
            role: 'assistant',
            model: body.model,
            content: [{ type: 'text', text: 'Claude 本地回复' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        )
        return
      }
      if (body.stream) {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        for (const content of ['本地', '流式']) {
          response.write(
            'data: ' +
              JSON.stringify({
                id: 'chat-local',
                object: 'chat.completion.chunk',
                created: 1,
                model: body.model,
                choices: [{ index: 0, delta: { content }, finish_reason: null }],
              }) +
              '\n\n',
          )
        }
        response.write(
          'data: ' +
            JSON.stringify({
              id: 'chat-local',
              object: 'chat.completion.chunk',
              created: 1,
              model: body.model,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            }) +
            '\n\ndata: [DONE]\n\n',
        )
        response.end()
        return
      }
      const value = responseFor(body)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          id: 'chat-local-' + ++usageIndex,
          object: 'chat.completion',
          created: 1,
          model: body.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: null, ...value },
              finish_reason: value.tool_calls ? 'tool_calls' : 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      )
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: error.message } }))
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseURL = 'http://127.0.0.1:' + server.address().port + '/v1'
}

/** 用假密钥与本地地址构造模型参数，不读取用户环境里的真实凭证。 */
function settings(model, provider = 'openai') {
  return { provider, model, apiKey: 'local-test-key', baseURL, timeoutMs: 2_000 }
}

try {
  await verify('提取全部完整示例并通过 Node 语法检查', async () => {
    const count = await extract()
    results.push({ name: '语法模块数', count })
  })
  await openServer()
  const common = (name) => import(pathToFileURL(join(samples, 'common', name + '.mjs')).href)
  const { createModel } = await common('model')
  const { messageText } = await common('text')
  const { invokeModels } = await common('invoke')
  const { runLoop } = await common('loop')
  const { mathTools, add } = await common('math-tools')
  const { loadSkillTools } = await common('skills')
  const { openMcp } = await common('mcp')
  const { createMemoryChat } = await common('memory-chat')
  const { buildAgentGraph } = await common('graph')
  const { createAskUserTool, validateAnswer } = await common('interaction')
  const { createLearningAgent } = await common('agent')

  /** 创建并登记 Agent，finally 中即使断言失败也会释放连接和执行。 */
  async function makeAgent({ model = 'chat', ...overrides } = {}) {
    const agent = await createLearningAgent({
      id: 'test_agent_' + resources.length,
      description: '测试能力',
      systemPrompt: '测试助手',
      models: { primary: settings(model) },
      interaction: { enabled: false },
      ...overrides,
    })
    resources.push(agent)
    return agent
  }

  await verify('OpenAI 与 Claude 真实适配器连接本地协议服务', async () => {
    assert.equal(messageText(await createModel(settings('chat')).invoke('你好')), '本地回复')
    assert.equal(
      messageText(await createModel(settings('claude', 'anthropic')).invoke('你好')),
      'Claude 本地回复',
    )
    assert(requests.some((item) => item.url.endsWith('/chat/completions')))
    assert(requests.some((item) => item.url.endsWith('/messages')))
  })
  await verify('OpenAI 流式消息块读取', async () => {
    let text = ''
    for await (const chunk of await createModel(settings('chat')).stream('流式'))
      text += messageText(chunk)
    assert.equal(text, '本地流式')
  })
  await verify('503 使用备用 Claude，401 不使用备用', async () => {
    const reply = await invokeModels({
      models: [createModel(settings('unavailable')), createModel(settings('claude', 'anthropic'))],
      messages: '测试',
      signal: AbortSignal.timeout(2_000),
    })
    assert.equal(messageText(reply), 'Claude 本地回复')
    const before = requests.length
    await assert.rejects(
      invokeModels({
        models: [
          createModel(settings('unauthorized')),
          createModel(settings('claude', 'anthropic')),
        ],
        messages: '测试',
      }),
    )
    assert.equal(requests.length - before, 1)
  })
  await verify('取消信号不触发备用，工具成功后切换不重复工具', async () => {
    let backup = 0
    const controller = new AbortController()
    const first = new ScriptModel(() => {
      controller.abort()
      throw new Error('请求取消')
    })
    await assert.rejects(
      invokeModels({
        models: [
          first,
          new ScriptModel(() => {
            backup++
            return ai('备用')
          }),
        ],
        messages: '测试',
        signal: controller.signal,
      }),
    )
    assert.equal(backup, 0)
    let attempts = 0
    const primary = new ScriptModel(() => {
      if (!attempts++) return ai('', [{ id: 'one', name: 'add', args: { a: 12, b: 8 } }])
      throw Object.assign(new Error('故障'), { status: 503 })
    })
    let toolRuns = 0
    const fallback = new ScriptModel((messages) => {
      assert.equal(messages.at(-1).tool_call_id, 'one')
      return ai('20')
    })
    const result = await runLoop({
      models: [primary, fallback],
      tools: [add],
      messages: [new HumanMessage('相加')],
      onTool: () => {
        toolRuns++
      },
    })
    assert.equal(messageText(result.reply), '20')
    assert.equal(toolRuns, 1)
  })
  await verify('手写工具循环与 LangChain createAgent 得到60', async () => {
    const model = createModel(settings('tool-loop'))
    const result = await runLoop({
      models: [model],
      tools: mathTools,
      messages: [new HumanMessage('计算')],
    })
    assert.equal(messageText(result.reply), '60')
    assert.equal(result.messages.filter((item) => item._getType?.() === 'tool').length, 2)
    const high = createAgent({ model, tools: mathTools, systemPrompt: '计算' })
    const reply = await high.invoke({ messages: [{ role: 'user', content: '计算' }] })
    assert.equal(messageText(reply.messages.at(-1)), '60')
  })
  await verify('工具循环拒绝未知工具、非法参数与超限', async () => {
    await assert.rejects(
      runLoop({
        models: [new ScriptModel(() => ai('', [{ id: 'x', name: 'unknown', args: {} }]))],
        tools: mathTools,
        messages: [],
        maxSteps: 1,
      }),
      /未授权/,
    )
    await assert.rejects(add.invoke({ a: '错误', b: 1 }))
    await assert.rejects(
      runLoop({
        models: [createModel(settings('forever'))],
        tools: mathTools,
        messages: [],
        maxSteps: 1,
      }),
      /上限/,
    )
  })
  await verify('Skills 名称发现、正文、参考文件与路径越界拒绝', async () => {
    const tools = await loadSkillTools([join(samples, 'skills')])
    const directory = Object.fromEntries(tools.map((item) => [item.name, item]))
    assert(
      JSON.parse(await directory.list_skills.invoke({})).some((item) => item.name === 'report'),
    )
    assert.match(await directory.read_skill.invoke({ name: 'report' }), /报告技能/)
    assert.match(
      await directory.read_skill_file.invoke({ name: 'report', file: 'references/format.md' }),
      /结论/,
    )
    await assert.rejects(
      directory.read_skill_file.invoke({ name: 'report', file: 'references/../SKILL.md' }),
      /越界/,
    )
    await assert.rejects(directory.read_skill.invoke({ name: 'unknown' }), /不存在/)
  })
  await verify('真实本地 stdio MCP 工具发现、调用和关闭', async () => {
    const mcp = await openMcp({
      math: {
        command: process.execPath,
        args: [join(samples, 'mcp/math-server.mjs')],
        transport: 'stdio',
      },
    })
    try {
      const selected = mcp.tools.find((item) => item.name.includes('remote_add'))
      assert(selected)
      assert.match(JSON.stringify(await selected.invoke({ a: 3, b: 4 })), /7/)
    } finally {
      await mcp.close()
    }
  })
  await verify('会话历史连续、跨用户隔离、同会话并发拒绝', async () => {
    const lengths = []
    const model = new ScriptModel((messages) => {
      lengths.push(messages.length)
      assert(!JSON.stringify(messages).includes('trusted-secret'))
      return ai('完成')
    })
    const chat = createMemoryChat({ models: [model], systemPrompt: '助手' })
    await chat.say({
      text: '一',
      threadId: 'same',
      context: { ...context, private: 'trusted-secret' },
    })
    await chat.say({ text: '二', threadId: 'same', context })
    await chat.say({ text: '三', threadId: 'same', context: { ...context, userId: 'other' } })
    assert.deepEqual(lengths, [2, 4, 2])
    const pending = chat.say({ text: '四', threadId: 'same', context })
    await assert.rejects(chat.say({ text: '五', threadId: 'same', context }), /正在执行/)
    await pending
  })
  await verify('LangGraph 模型工具往返与检查点历史', async () => {
    const graph = buildAgentGraph({
      models: [createModel(settings('tool-loop'))],
      tools: mathTools,
      systemPrompt: '计算',
      checkpointer: new MemorySaver(),
    })
    const config = { configurable: { thread_id: 'test-graph' }, recursionLimit: 20 }
    const result = await graph.invoke({ messages: [new HumanMessage('计算')] }, config)
    assert.equal(messageText(result.messages.at(-1)), '60')
    assert.deepEqual((await graph.getState(config)).next, [])
  })
  await verify('候选问题校验与原图暂停恢复', async () => {
    assert.throws(
      () => validateAnswer({ question: question(), answer: { optionId: 'bad' } }),
      /不存在/,
    )
    assert.throws(
      () =>
        validateAnswer({ question: { ...question(), allowText: false }, answer: { text: '其他' } }),
      /文字/,
    )
    const graph = buildAgentGraph({
      models: [createModel(settings('ask'))],
      tools: [createAskUserTool()],
      systemPrompt: '询问',
      checkpointer: new MemorySaver(),
    })
    const config = { configurable: { thread_id: 'test-interrupt' } }
    const paused = await graph.invoke({ messages: [new HumanMessage('开始')] }, config)
    assert.equal(paused.__interrupt__.length, 1)
    const resumed = await graph.invoke(
      new Command({
        resume: { [paused.__interrupt__[0].id]: { optionId: 'month' } },
      }),
      config,
    )
    assert.equal(resumed.__interrupt__, undefined)
    assert.match(messageText(resumed.messages.at(-1)), /月报/)
  })
  await verify('第九课实际 Send 图动态并行、两个子问题、恢复后一次汇总', async () => {
    const script = await readFile(join(samples, '09-subagents.mjs'), 'utf8')
    const prefix = script.slice(0, script.indexOf('const config = {'))
    const moduleFile = join(samples, '09-test.mjs')
    await writeFile(moduleFile, prefix + '\nexport { graph }\n')
    process.env.AGENT_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'local-test-key'
    process.env.OPENAI_MODEL = 'course9'
    process.env.OPENAI_BASE_URL = baseURL
    const { graph } = await import(pathToFileURL(moduleFile).href)
    const config = {
      configurable: { thread_id: 'dynamic-send' },
      maxConcurrency: 3,
      recursionLimit: 50,
    }
    const before = requests.length
    const paused = await graph.invoke({ input: '测试任务' }, config)
    assert.equal(paused.__interrupt__.length, 2)
    const answers = Object.fromEntries(
      paused.__interrupt__.map((item) => [item.id, { optionId: 'month' }]),
    )
    const result = await graph.invoke(new Command({ resume: answers }), config)
    assert.equal(result.results.length, 3)
    assert.equal(result.output, '所有任务已汇总')
    const subset = requests.slice(before)
    assert.equal(
      subset.filter((item) =>
        item.body.messages.some(
          (m) => m.role === 'system' && String(m.content).includes('将任务拆'),
        ),
      ).length,
      1,
    )
    assert.equal(
      subset.filter((item) =>
        item.body.messages.some(
          (m) => m.role === 'system' && String(m.content).includes('负责算术'),
        ),
      ).length,
      2,
    )
  })
  await verify('封装输入输出校验、归属隔离及事件', async () => {
    const events = []
    const agent = await makeAgent({
      model: 'json',
      inputSchema: z.object({ topic: z.string() }),
      outputSchema: z.object({ summary: z.string(), missing: z.array(z.string()) }),
      onEvent: (event) => events.push(event),
    })
    await assert.rejects(agent.run({ input: '错误', context }))
    const result = await agent.run({ input: { topic: '报告' }, threadId: 'schema', context })
    assert.equal(result.status, 'completed')
    assert.equal(result.output.summary, '本地结果')
    assert.throws(
      () => agent.getRun({ runId: result.runId, context: { ...context, userId: 'other' } }),
      /无权/,
    )
    assert(events.some((item) => item.type === 'run.completed'))
    const invalid = await makeAgent({
      model: 'invalid-json',
      outputSchema: z.object({ summary: z.string() }),
    })
    assert.equal((await invalid.run({ input: '报告', context })).status, 'failed')
  })
  await verify('封装等待、漏答拒绝、并发会话拒绝、同run恢复', async () => {
    const agent = await makeAgent({ model: 'ask', interaction: { enabled: true } })
    const paused = await agent.run({ input: '开始', threadId: 'waiting', context })
    assert.equal(paused.status, 'waiting_input')
    await assert.rejects(agent.run({ input: '另一条', threadId: 'waiting', context }), /已有/)
    await assert.rejects(agent.resume({ runId: paused.runId, answers: {}, context }), /一一对应/)
    await assert.rejects(
      agent.resume({
        runId: paused.runId,
        answers: { [paused.interactions[0].id]: { optionId: 'bad' } },
        context,
      }),
      /不存在/,
    )
    const result = await agent.resume({
      runId: paused.runId,
      answers: { [paused.interactions[0].id]: { optionId: 'week' } },
      context,
    })
    assert.equal(result.runId, paused.runId)
    assert.equal(result.status, 'completed')
    assert.match(result.reply, /周报/)
  })
  await verify('封装并行委派同一子Agent、两个问题与共享计数', async () => {
    const worker = await makeAgent({
      id: 'worker',
      model: 'child',
      interaction: { enabled: true },
    })
    const parent = await makeAgent({
      model: 'parent',
      subAgents: [worker],
      limits: { maxConcurrentModels: 1 },
    })
    const paused = await parent.run({ input: '两个任务', context })
    assert.equal(paused.status, 'waiting_input')
    assert.equal(paused.interactions.length, 2)
    assert(paused.interactions.every((item) => item.agentId === 'worker'))
    const result = await parent.resume({
      runId: paused.runId,
      answers: Object.fromEntries(
        paused.interactions.map((item) => [item.id, { optionId: 'month' }]),
      ),
      context,
    })
    assert.equal(result.status, 'completed', JSON.stringify(result.error))
    assert.equal(result.usage.steps, 6)
    assert.equal(result.usage.tokens, 12)
    assert.equal(result.usage.tasks, 2)
  })
  await verify('父权限约束子代理、总步骤及深度任务上限', async () => {
    const worker = await makeAgent({ id: 'worker', model: 'forever', tools: mathTools })
    const parent = await makeAgent({
      model: 'delegate-once',
      subAgents: [worker],
      policy: { authorize: async ({ toolName }) => toolName !== 'add' },
    })
    const denied = await parent.run({ input: '委派', context })
    assert.equal(denied.status, 'failed')
    assert.match(denied.error.message, /权限/)
    const zeroDepth = await makeAgent({
      model: 'delegate-once',
      subAgents: [worker],
      limits: { maxDepth: 0 },
    })
    assert.match((await zeroDepth.run({ input: '委派', context })).error.message, /深度/)
    const limit = await makeAgent({ model: 'forever', tools: mathTools, limits: { maxSteps: 2 } })
    const limited = await limit.run({ input: '循环', context })
    assert.equal(limited.status, 'failed')
    assert.equal(limited.usage.steps, 2)
    const one = await makeAgent({
      model: 'parent',
      subAgents: [worker],
      limits: { maxTasks: 1 },
    })
    assert.match((await one.run({ input: '两个任务', context })).error.message, /总数/)
  })
  await verify('取消等待、外部取消、超时与关闭资源', async () => {
    const ask = await makeAgent({ model: 'ask', interaction: { enabled: true } })
    const paused = await ask.run({ input: '开始', threadId: 'cancelled', context })
    assert.equal((await ask.cancel({ runId: paused.runId, context })).status, 'cancelled')
    await assert.rejects(ask.run({ input: '再来', threadId: 'cancelled', context }), /新的/)
    const slow = await makeAgent({ model: 'slow' })
    const controller = new AbortController()
    const active = slow.run({ input: '慢任务', signal: controller.signal, context })
    setTimeout(() => controller.abort(), 20)
    assert.equal((await active).status, 'cancelled')
    const timed = await makeAgent({ model: 'slow', limits: { timeoutMs: 20 } })
    assert.equal((await timed.run({ input: '慢任务', context })).status, 'failed')
    const expiry = await makeAgent({
      model: 'ask',
      interaction: { enabled: true },
      limits: { maxWaitMs: 30 },
    })
    const waiting = await expiry.run({ input: '开始', context })
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(expiry.getRun({ runId: waiting.runId, context }).status, 'failed')
    const closing = await makeAgent({ model: 'slow' })
    const inFlight = closing.run({ input: '慢任务', context })
    await closing.close()
    assert.equal((await inFlight).status, 'cancelled')
    await assert.rejects(closing.run({ input: '开始', context }), /关闭/)
  })
} finally {
  await Promise.allSettled(resources.reverse().map((item) => item.close()))
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  await mkdir(dirname(evidencePath), { recursive: true })
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        node: process.version,
        scope: '本地模拟模型响应与真实SDK、本地只读stdio MCP；未调用外部付费模型',
        results,
        summary: {
          passed: results.filter((item) => item.status === 'passed').length,
          failed: results.filter((item) => item.status === 'failed').length,
        },
      },
      null,
      2,
    ) + '\n',
  )
}
if (results.some((item) => item.status === 'failed')) process.exitCode = 1
