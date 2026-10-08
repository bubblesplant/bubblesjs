import { Logger } from '@nestjs/common'
import { z } from 'zod'

/** 仅依赖安全事件所需的请求字段，兼容 Nest 适配器与应用侧 Fastify 类型。 */
interface PasswordEventRequest {
  method: string
  routeOptions?: { url?: string }
  id: string
  auth?: { userId: string }
}

const logger = new Logger('PasswordSecurityEvent')
const failureCodes = new WeakMap<PasswordEventRequest, string>()
const resolvedTargets = new WeakMap<PasswordEventRequest, string>()
const uuidSchema = z.uuid()

type PasswordEvent = 'account.password.change' | 'account.password.reset'

/** 仅按框架匹配的路由模板识别改密接口，不读取含用户输入的原始 URL。 */
function passwordEventForRoute(request: PasswordEventRequest): PasswordEvent | null {
  if (request.method !== 'POST') return null
  switch (request.routeOptions?.url) {
    case '/auth/change-password':
      return 'account.password.change'
    case '/platform/accounts/:userId/reset-password':
      return 'account.password.reset'
    default:
      return null
  }
}

/** 记录统一异常过滤器选定的公开错误码，供响应结束时安全记录使用。 */
export function markPasswordFailure(request: PasswordEventRequest, reasonCode: string): boolean {
  if (!passwordEventForRoute(request)) return false
  failureCodes.set(request, reasonCode)
  return true
}

/** 只在业务层确认目标账号存在后写入其 ID；守卫拒绝及目标缺失均保持 null。 */
export function markPasswordTargetResolved(
  request: PasswordEventRequest,
  targetUserId: string,
): void {
  if (
    passwordEventForRoute(request) === 'account.password.reset' &&
    uuidSchema.safeParse(targetUserId).success
  ) {
    resolvedTargets.set(request, targetUserId)
  }
}

/** 将未进入统一异常过滤器的 HTTP 失败映射为稳定且不含请求内容的原因码。 */
function fallbackReasonCode(status: number): string {
  switch (status) {
    case 400:
      return 'COMMON.BAD_REQUEST'
    case 401:
      return 'COMMON.UNAUTHORIZED'
    case 403:
      return 'COMMON.FORBIDDEN'
    case 404:
      return 'COMMON.NOT_FOUND'
    case 503:
      return 'AUTH.SERVICE_UNAVAILABLE'
    default:
      return status >= 500 ? 'COMMON.INTERNAL_SERVER_ERROR' : `COMMON.HTTP_${status}`
  }
}

/**
 * 每个改密请求在响应结束后只输出一条固定字段事件，覆盖守卫、参数校验和业务失败。
 * 事件不遍历请求体、响应体或异常对象，避免凭据与摘要进入日志。
 */
export function logPasswordSecurityEvent(
  request: PasswordEventRequest,
  reply: { statusCode: number },
): void {
  const event = passwordEventForRoute(request)
  if (!event) return

  const actorUserId = request.auth?.userId ?? null
  const targetUserId =
    event === 'account.password.change' ? actorUserId : (resolvedTargets.get(request) ?? null)
  const success = reply.statusCode >= 200 && reply.statusCode < 300
  const reasonCode = success
    ? null
    : (failureCodes.get(request) ?? fallbackReasonCode(reply.statusCode))

  logger.log({
    event,
    actorUserId,
    targetUserId,
    requestId: String(request.id),
    result: success ? 'success' : 'failure',
    reasonCode,
    occurredAt: new Date().toISOString(),
  })
}
