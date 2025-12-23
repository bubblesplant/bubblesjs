import type { ChartRequestType } from '../../src'

// 模拟会话列表数据
export const mockConversations = [
  { conversation_id: '1', title: '关于 Vue 3 的问题', created_at: new Date().toISOString() },
  { conversation_id: '2', title: '如何使用 TypeScript', created_at: new Date(Date.now() - 86400000).toISOString() },
  { conversation_id: '3', title: 'CSS 布局技巧', created_at: new Date(Date.now() - 172800000).toISOString() },
]

// 模拟历史消息
export const mockHistoryMessages: Record<string, { type: 'request' | 'response', content: string, reason?: string }[]> = {
  1: [
    { type: 'request', content: 'Vue 3 有什么新特性？' },
    { type: 'response', content: 'Vue 3 的主要新特性包括：\n\n1. **Composition API** - 更灵活的代码组织方式\n2. **更好的 TypeScript 支持**\n3. **性能提升** - 更快的虚拟 DOM\n4. **Teleport 组件** - 可以将内容渲染到 DOM 的其他位置\n5. **Fragments** - 组件可以有多个根节点', reason: '让我思考一下 Vue 3 的主要特性...' },
  ],
  2: [
    { type: 'request', content: 'TypeScript 的基本类型有哪些？' },
    { type: 'response', content: 'TypeScript 的基本类型包括：\n\n- `string` - 字符串\n- `number` - 数字\n- `boolean` - 布尔值\n- `array` - 数组\n- `tuple` - 元组\n- `enum` - 枚举\n- `any` - 任意类型\n- `void` - 无返回值\n- `null` 和 `undefined`' },
  ],
}

// 模拟 AI 回复内容
export const mockResponses = [
  '这是一个很好的问题！让我来详细解答一下...\n\n首先，我们需要了解基本概念。在软件开发中，这个问题涉及到多个方面：\n\n1. **架构设计** - 良好的架构是成功的基础\n2. **代码质量** - 保持代码整洁和可维护\n3. **测试覆盖** - 确保功能正确性\n\n希望这个回答对你有帮助！',
  '根据你的问题，我来分析一下：\n\n这个场景下，推荐使用以下方案：\n\n```typescript\nconst solution = {\n  step1: "分析需求",\n  step2: "设计方案",\n  step3: "实现功能",\n  step4: "测试验证"\n}\n```\n\n如果还有疑问，欢迎继续提问！',
  '让我为你解释这个概念：\n\n在现代前端开发中，组件化是非常重要的思想。通过将 UI 拆分成独立、可复用的组件，我们可以：\n\n- 提高代码复用性\n- 降低维护成本\n- 提升开发效率\n\n这就是为什么 Vue、React 等框架都采用组件化架构的原因。',
]

// 模拟思考过程
export const mockReasons = [
  '让我仔细思考这个问题...\n\n首先需要理解用户的真实需求，然后从多个角度分析可能的解决方案...',
  '这是一个有深度的问题，我需要从以下几个方面来考虑：\n1. 技术可行性\n2. 实现复杂度\n3. 最佳实践',
  '正在分析问题的关键点...\n\n用户似乎想要了解更深层次的原理，我应该从基础概念开始解释...',
]

// 推荐问题
export const mockRecommends = [
  {
    category: '开发问题',
    icon: 'search',
    prompts: ['如何优化 Vue 性能？', '前端安全最佳实践'],
  },
  {
    category: '学习资源',
    icon: 'plan',
    prompts: ['推荐 TypeScript 学习路径', '前端面试题汇总'],
  },
  {
    category: '工具推荐',
    icon: 'pill',
    prompts: ['好用的 VS Code 插件', '前端构建工具对比'],
  },
  {
    category: '架构设计',
    icon: 'diagnosis',
    prompts: ['微前端架构方案', '状态管理最佳实践'],
  },
]

// 工具函数
export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 获取会话列表
export async function getConversationList() {
  await delay(300)
  return mockConversations
}

// 获取会话详情
export async function getConversationDetail({ conversationId }: { conversationId: string }) {
  await delay(500)
  return mockHistoryMessages[conversationId] || []
}

// 创建新会话
export async function createConversation() {
  await delay(300)
  const newId = String(Date.now())
  mockConversations.unshift({
    conversation_id: newId,
    title: '新会话',
    created_at: new Date().toISOString(),
  })
  return newId
}

// 删除会话
export async function deleteConversation({ conversationId }: { conversationId: string }) {
  await delay(200)
  const index = mockConversations.findIndex(c => c.conversation_id === conversationId)
  if (index > -1) {
    mockConversations.splice(index, 1)
  }
  delete mockHistoryMessages[conversationId]
}

// 模拟流式输出的核心函数
export const chartRequest: ChartRequestType = async ({
  conversationId,
  currentRequest,
  setCurrentResponse,
  setCurrentReason,
  setResponseLoading,
  chartSignal,
  doneFunc,
}) => {
  // eslint-disable-next-line no-console
  console.log('收到请求:', { conversationId, currentRequest })

  setResponseLoading(false)

  // 随机选择回复内容
  const responseIndex = Math.floor(Math.random() * mockResponses.length)
  const fullResponse = mockResponses[responseIndex]
  const fullReason = mockReasons[responseIndex]

  let reason = ''
  let response = ''

  // 模拟流式输出思考过程
  for (const char of fullReason) {
    if (chartSignal.aborted) {
      return
    }
    reason += char
    setCurrentReason(reason)
    await delay(20)
  }

  // 模拟流式输出回复内容
  for (const char of fullResponse) {
    if (chartSignal.aborted) {
      return
    }
    response += char
    setCurrentResponse(response)
    await delay(30)
  }

  // 保存到历史记录
  if (!mockHistoryMessages[conversationId]) {
    mockHistoryMessages[conversationId] = []
  }
  mockHistoryMessages[conversationId].push(
    { type: 'request', content: currentRequest },
    { type: 'response', content: fullResponse, reason: fullReason },
  )

  doneFunc?.()
}
