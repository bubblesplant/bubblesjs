import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/** 创建请求层专用 HTTP 服务，支持控制迟到响应以验证完整拦截器链路。 */
export function createRequestServer() {
  const waiting = new Map<string, (response: ServerResponse) => void>()
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    const notify = waiting.get(request.url ?? '')
    if (notify) {
      waiting.delete(request.url ?? '')
      notify(response)
      return
    }
    if (request.url === '/credentials') {
      response
        .writeHead(422)
        .end(JSON.stringify({ code: 'AUTH.INVALID_CREDENTIALS', message: '账号或密码错误' }))
    } else if (request.url === '/expired' || request.url?.startsWith('/auth/')) {
      response.writeHead(401).end(
        JSON.stringify({
          code: 'AUTH.SESSION_INVALID',
          message: '登录已失效，请重新登录',
          authorization: request.headers.authorization ?? null,
        }),
      )
    } else if (request.url === '/unavailable') {
      response.writeHead(503).end(
        JSON.stringify({
          code: 'AUTH.SERVICE_UNAVAILABLE',
          message: '登录服务暂时不可用，请稍后重试',
        }),
      )
    } else if (request.url?.startsWith('/http-status/')) {
      const status = Number(request.url.split('/').at(-1))
      response.writeHead(status).end(status === 204 ? undefined : JSON.stringify({ status }))
    } else {
      response.end(
        JSON.stringify({ id: 'test-user', authorization: request.headers.authorization }),
      )
    }
  })

  return {
    baseURL: '',
    /** 启动随机本机端口，避免占用开发服务的固定端口。 */
    async start() {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      this.baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    },
    /** 等待指定路径到达服务端，由测试自行决定其完成时机与响应状态。 */
    waitForResponse(path: string): Promise<ServerResponse> {
      return new Promise((resolve) => waiting.set(path, resolve))
    },
    /** 强制关闭遗留连接，确保失败测试也不会留下本机 HTTP 服务。 */
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
    },
  }
}
