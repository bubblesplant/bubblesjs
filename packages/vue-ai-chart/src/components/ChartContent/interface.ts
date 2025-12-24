export interface ChartItemType {
  type: 'request' | 'response'
  content: string
  reason?: string
}

export type conversationIdType = string

export type createConversationRequestType = () => Promise<string>

export interface ChartRequestParamsType {
  conversationId: conversationIdType
  currentRequest: string
  chartSignal: AbortSignal
  setCurrentResponse: (response: string) => void
  setCurrentReason: (reason: string) => void
  setResponseLoading: (loading: boolean) => void
  doneFunc?: () => void
}

export type ChartRequestType = ({ conversationId, currentRequest, setCurrentResponse, setCurrentReason, setResponseLoading, chartSignal, doneFunc }: ChartRequestParamsType) => Promise<void>

export type conversationDetailRequestType = ({ conversationId }: { conversationId: conversationIdType }) => Promise<ChartItemType[]>

export interface currentChartType {
  request: string | undefined
  response: string | undefined
  reason: string | undefined
  loading: boolean
}
