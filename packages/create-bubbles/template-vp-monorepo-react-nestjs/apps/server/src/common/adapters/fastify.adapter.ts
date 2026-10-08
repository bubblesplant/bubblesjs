import { FastifyAdapter } from '@nestjs/platform-fastify'
import { randomUUID } from 'crypto'
import { logPasswordSecurityEvent } from '../security/password-security-event'

/**
 * 创建 Fastify 适配器，配置请求 ID、原始二进制流解析及响应关联 ID。
 */
export function createFastifyAdapter() {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    genReqId: () => randomUUID(),
    logger: false,
  })

  adapter
    .getInstance()
    /** 保留原始二进制请求流，供上传服务逐块处理而无需整段缓冲。 */
    .addContentTypeParser('application/octet-stream', (_request, payload, done) => {
      done(null, payload)
    })

  /** 在所有响应上返回请求关联 ID，便于客户端反馈问题时定位服务端日志。 */
  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id)
    done()
  })
  /** 以最终 HTTP 状态为准，每条密码操作请求只记录一次固定字段安全事件。 */
  adapter.getInstance().addHook('onResponse', (request, reply, done) => {
    logPasswordSecurityEvent(request, reply)
    done()
  })
  return adapter
}
