import type { InjectionKey, Ref } from 'vue'
import { ref } from 'vue'

export type conversationIdType = string | undefined

export type setConversationIdType = (conversationId?: conversationIdType) => void

export const ChartStatusMap = {
  INIT: 'init', // 初始状态 点击新建会话 还没有输入消息
  FIRST_GENERATE: 'firstGenerate', // 第一次对话 要去请求会话id
  GENERATING: 'generating', // 生成中
  HISTORY: 'history', // 回显历史会话
  WAIT: 'wait', // 等待用户输入
} as const

export type ChartStatusType = typeof ChartStatusMap[keyof typeof ChartStatusMap]

export type setChartStatusType = (chartStatus: ChartStatusType) => void

export interface AiChartContext {
  conversationId: Ref<conversationIdType>
  setConversationId: setConversationIdType
  chartStatus: Ref<ChartStatusType>
  setChartStatus: setChartStatusType

}

/**
 * inject 的默认值
 */
export const defaultChartContext: AiChartContext = {
  conversationId: ref<conversationIdType>(),
  setConversationId: () => {},
  chartStatus: ref<ChartStatusType>(ChartStatusMap.INIT),
  setChartStatus: () => {},
}

export const AiChartProvideKey: InjectionKey<AiChartContext> = Symbol('AiChart')
