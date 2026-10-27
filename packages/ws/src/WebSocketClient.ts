import type { MessageType } from './types'
import { EventDispatcher } from './dispatcher'

export type socketStateType = 0 | 1 | 2 | 3 | undefined

export type websocketContentType = 'connect' | 'ping' | 'pong' | 'message' | 'close'

export type websocketContent = {
  type: websocketContentType
  content: Object
}

export class WebSocketClient extends EventDispatcher {
  // #socket链接
  private url = ''
  // #socket实例
  private socket?: WebSocket

  // #重连次数
  private reconnectAttempts = 0
  // #最大重连数
  private maxReconnectAttempts = 5

  // #重连间隔
  private reconnectInterval = 10000 // 10 seconds

  // #发送心跳数据间隔
  private heartbeatInterval = 1000 * 30

  // 彻底终止ws
  private stopWs = false

  private heartbeatTimer?: ReturnType<typeof setInterval>

  constructor(url: string) {
    super()
    this.url = url
  }

  onopen(callBack: Function) {
    this.addEventListener('open', callBack)
  }

  onmessage(callBack: Function) {
    this.addEventListener('message', callBack)

    return () => {
      this.removeEventListener('message')
    }
  }

  onclose(callBack: Function) {
    this.addEventListener('close', callBack)
  }
  onerror(callBack: Function) {
    this.addEventListener('error', callBack)
  }

  // !初始化连接
  public async connect(params = ''): Promise<socketStateType> {
    if (this.reconnectAttempts === 0) {
      this.log('websocket', `初始话连接中...${this.url}`)
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return WebSocket.OPEN as socketStateType
    }
    const url = this.url.includes('?') ? `${this.url}&${params}` : `${this.url}?${params}`

    const asyncConnect = () => {
      return new Promise((resolve) => {
        const ws = new WebSocket(url)

        ws.onopen = (event) => {
          this.stopWs = false
          // 重置重连尝试成功连接
          this.reconnectAttempts = 0
          // 在连接成功时停止当前的心跳检测并重新启动
          this.startHeartbeat()
          this.log('WebSocket', `连接成功,等待服务端数据推送[onopen]...     ${this.url}`)
          this.dispatchEvent('open', event)
          resolve(ws)
        }
      })
    }
    this.socket = (await asyncConnect()) as WebSocket

    this.socket.onmessage = (event) => {
      this.dispatchEvent('message', event)
      this.startHeartbeat()
    }

    this.socket.onclose = (event) => {
      if (this.reconnectAttempts === 0) {
        this.log('WebSocket', `连接断开[onclose]...    ${this.url}`)
      }
      if (!this.stopWs) {
        this.reconnect()
      }
      this.dispatchEvent('close', event)
    }

    this.socket.onerror = (event) => {
      if (this.reconnectAttempts === 0) {
        this.log('WebSocket', `连接异常[onerror]...    ${this.url}`)
      }
      this.closeHeartbeat()
      this.dispatchEvent('error', event)
    }
    return this.socket.readyState as socketStateType
  }

  public send(message: MessageType): void {
    message.uuid = Number.parseInt(`${Math.random() * 10 ** 10}`)
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    } else {
      this.log('[WebSocket] 未连接', message.type)
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      this.log(
        'WebSocket',
        `尝试重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})       ${this.url}`,
      )
      setTimeout(() => {
        this.connect()
      }, this.reconnectInterval)
    } else {
      this.closeHeartbeat()
      this.log('WebSocket', `最大重连失败，终止重连: ${this.url}`)
    }
  }

  public close(): socketStateType {
    const connectState = this.socket?.readyState
    if (this.socket) {
      this.stopWs = true
      this.socket.close()
      this.socket = undefined
      this.removeEventListener('open')
      this.removeEventListener('message')
      this.removeEventListener('close')
      this.removeEventListener('error')
    }
    this.closeHeartbeat()
    return connectState as socketStateType
  }

  private startHeartbeat(): void {
    if (this.stopWs) return
    if (this.heartbeatTimer) {
      this.closeHeartbeat()
    }

    const sendHeartBeat = () => {
      if (this.socket) {
        const pingContent: websocketContent = {
          type: 'ping',
          content: {},
        }
        this.socket.send(JSON.stringify(pingContent))
        this.log('websocket', '发送心跳包')
      } else {
        console.error('[WebSocket] 未连接')
      }
    }
    this.heartbeatTimer = setInterval(() => {
      sendHeartBeat()
    }, this.heartbeatInterval)
  }

  private closeHeartbeat(): void {
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
  }
}
