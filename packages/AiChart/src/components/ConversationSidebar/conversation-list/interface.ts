export type ConversationItem<T extends Record<string, string>> = T & {
  [key in T[keyof T]]: string
}

export interface GroupedConversations<T extends Record<string, string>> {
  today: ConversationItem<T>[]
  yesterday: ConversationItem<T>[]
  last7Days: ConversationItem<T>[]
  last30Days: ConversationItem<T>[]
  other: ConversationItem<T>[]
}

export interface ConversationListFieldNames {
  conversationId: string
  title: string
  createTime: string
}

export type GetConversationListRequest = () => Promise<any[]>

export type DeleteConversationRequest = ({ conversationId }: { conversationId: string }) => void

export type RenameConversationRequest = (conversationId: string, title: string) => Promise<void>
