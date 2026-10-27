# @bubblesjs/ws

浏览器 WebSocket 客户端封装，提供连接、发送消息、事件订阅、自动重连和定时心跳发送。无运行时依赖，可用于 Vue、React 或原生 JavaScript 项目。

当前版本从现有项目提取，保留原有运行逻辑。连接生命周期、重连、心跳和订阅清理的改进暂未纳入本次迁移。原项目中的登录状态、UI 提示及业务响应处理由应用继续负责。

## 安装

```bash
pnpm add @bubblesjs/ws
```

本仓库内的应用可以使用 `"@bubblesjs/ws": "workspace:*"`。

## 使用

```ts
import { SocketStateEnum, WebSocketClient } from '@bubblesjs/ws'

const ws = new WebSocketClient('wss://example.com/ws')

ws.onmessage((event: MessageEvent) => {
  console.log('收到消息：', event.data)
})

ws.onclose((event: CloseEvent) => {
  console.log('连接关闭：', event.code)
})

ws.onerror((event: Event) => {
  console.error('连接异常：', event)
})

const params = new URLSearchParams({ 'X-Access-Token': 'your-token' })
const state = await ws.connect(params.toString())

if (state === SocketStateEnum.OPEN) {
  ws.send({ type: 'message', content: { text: 'hello' } })
}

// 页面或业务结束时关闭连接。
ws.close()
```

需要发送数据时，在 `await ws.connect()` 完成后调用 `send()`。

## API

| 方法                       | 说明                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `new WebSocketClient(url)` | 创建客户端，尚不建立连接                                    |
| `connect(params?)`         | 建立连接，参数为查询字符串，返回 `Promise<socketStateType>` |
| `send(message)`            | 发送 JSON 消息，并在传入对象上写入随机数 `uuid`             |
| `onopen(callback)`         | 订阅原生 `Event` 打开事件                                   |
| `onmessage(callback)`      | 订阅原生 `MessageEvent`，返回取消函数                       |
| `onclose(callback)`        | 订阅原生 `CloseEvent` 关闭事件                              |
| `onerror(callback)`        | 订阅原生 `Event` 错误事件                                   |
| `close()`                  | 关闭连接、清理监听器和心跳，返回关闭前的连接状态            |
| `closeConsole()`           | 关闭日志输出，对所有实例生效                                |

导出 `WebSocketClient`、`EventDispatcher`、`SocketStateEnum`，以及 `MessageType`、`socketStateType`、`websocketContent`、`websocketContentType`、`dispatchEventType` 类型。

`MessageType` 暂时保留原项目已有的消息类型联合，包含基础消息、系统通知和聊天消息。

## 当前行为

- 重连间隔为 10 秒，最大重连次数配置为 5 次；首次或重连握手失败时，连接 Promise 仍可能一直等待，后续重试也可能无法继续。
- 自动重连不会保留首次 `connect(params)` 的参数；已经安排的重连也不会被 `close()` 取消。
- 空闲时每 30 秒发送 `{"type":"ping","content":{}}`，收到任意消息后重新计时；尚无 `pong` 超时检测。
- `onmessage()` 返回的取消函数会清空所有消息监听器。
- 连接建立过程中重复调用 `connect()` 可能创建多个连接。
- 未连接时调用 `send()` 仅记录日志，消息不会排队或补发。

以上行为沿用迁移前实现，后续可在此包内继续审查和调整。

## 本地开发

在仓库根目录执行：

```bash
vp run --filter @bubblesjs/ws typecheck
vp run --filter @bubblesjs/ws build
```

构建输出为 `dist/index.js` 和 `dist/index.d.ts`，使用 ESM 模块格式。此包面向具备原生 `WebSocket` 的浏览器环境；服务端渲染时请在浏览器端建立连接。
