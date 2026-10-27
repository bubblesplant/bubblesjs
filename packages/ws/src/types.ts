export enum SocketStateEnum {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

type websocketContentType =
  | 'connect'
  | 'ping'
  | 'pong'
  | 'message'
  | 'close'
  | 'system_message' //系统消息-查询消息列表
  | 'system_message_count' // 系统消息-未读消息数量
  | 'chat_message_count' // 聊天消息-未读消息数量
  | 'session_list_init' // 聊天消息-会话信息列表
  | 'system_message' // 系统消息-会话信息列表
  | 'chat_message_write' // 聊天消息-发送消息
  | 'session_info_init' // 聊天消息-会话信息初始化
  | 'chat_message_push' // 聊天消息-接收消息
  | 'chat_message_read' // 聊天消息-已读消息
  | 'system_message_push' // 系统消息-接收消息
  | 'system_message_read' // 系统消息-已读消息
  | 'session_info_push' // 聊天消息-会话信息推送
  | 'his_chat_message' // 聊天消息-历史消息

export type MessageType = {
  type: websocketContentType
  content: Object
  uuid?: number
}
