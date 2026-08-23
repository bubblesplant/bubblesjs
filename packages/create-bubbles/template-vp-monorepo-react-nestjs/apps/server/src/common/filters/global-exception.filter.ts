import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { FastifyReply, FastifyRequest } from 'fastify'
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod'
import { ApiErrorDetail, ApiFailure } from 'shared/types'
import { ZodError } from 'zod'
import { COMMON_ERRORS } from '../error/common.error'
import { AppException } from '../exceptions/app.exception'

interface PublicHttpError {
  readonly code: string
  readonly message: string
}

const MAX_DETAIL_COUNT = 20
const MAX_DETAIL_PATH_LENGTH = 200
/**
 * 错误响应体的 details[number].code 的最长长度限制
 */
const MAX_DETAIL_CODE_LENGTH = 80
const MAX_PUBLIC_MESSAGE_LENGTH = 300
const MAX_LOG_MESSAGE_LENGTH = 1000
const MAX_LOG_FRAME_LENGTH = 600
const MAX_LOG_STACK_FRAMES = 12

interface NormalizedFailure {
  readonly status: number
  readonly body: ApiFailure
  readonly cause?: unknown
  readonly bearerChallenge?: boolean
}

const PUBLIC_HTTP_ERRORS: Readonly<Record<number, PublicHttpError>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'COMMON.BAD_REQUEST',
    message: '请求内容无效',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'COMMON.UNAUTHORIZED',
    message: '身份认证失败',
  },
  [HttpStatus.FORBIDDEN]: {
    code: 'COMMON.FORBIDDEN',
    message: '没有权限执行此操作',
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'COMMON.NOT_FOUND',
    message: '请求的资源不存在',
  },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    code: 'COMMON.METHOD_NOT_ALLOWED',
    message: '请求方法不受支持',
  },
  [HttpStatus.CONFLICT]: {
    code: 'COMMON.CONFLICT',
    message: '当前资源状态存在冲突',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: 'COMMON.PAYLOAD_TOO_LARGE',
    message: '请求内容过大',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    code: 'COMMON.UNSUPPORTED_MEDIA_TYPE',
    message: '请求内容类型不受支持',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'COMMON.UNPROCESSABLE_CONTENT',
    message: '请求内容无法处理',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'COMMON.TOO_MANY_REQUESTS',
    message: '请求过于频繁，请稍后重试',
  },
}

function cleanPublicText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return ''
  }

  // 这段代码是在把字符串中的“不可见控制字符和换行符”全部替换成空格：
  // \u0000-\u001F：ASCII 控制字符，包括换行 \n、回车 \r、Tab 等。
  // \u007F-\u009F：其他不可见控制字符。
  // \u2028：Unicode 行分隔符。
  // \u2029：Unicode 段落分隔符。
  return (
    value
      // oxlint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
      .trim()
      .slice(0, maxLength)
  )
}

function cleanDetailCode(value: unknown): string {
  const code = cleanPublicText(value, MAX_DETAIL_CODE_LENGTH)
  if (/^[A-Za-z][A-Za-z0-9._-]*$/.test(code)) {
    return code
  }
  return 'invalid'
}

function normalizeDetails(
  details: readonly ApiErrorDetail[] | undefined,
): ApiErrorDetail[] | undefined {
  const normalized = details?.slice(0, MAX_DETAIL_COUNT).map((detail) => {
    const path = cleanPublicText(detail.path, MAX_DETAIL_PATH_LENGTH)
    const message = cleanPublicText(detail.message, MAX_PUBLIC_MESSAGE_LENGTH) || '请求内容无效'

    return {
      ...(path ? { path } : {}),
      code: cleanDetailCode(detail.code),
      message,
    }
  })
  return normalized?.length ? normalized : undefined
}

function normalizeStatus(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return HttpStatus.INTERNAL_SERVER_ERROR
  }
  if (value < 400 || value > 599) {
    return HttpStatus.INTERNAL_SERVER_ERROR
  }

  return value
}

/**
 * 对日志文本进行脱敏处理
 * @param value 日志文本
 * @param maxLength 最大长度
 * @returns 脱敏后的日志文本
 */
function sanitizeLogText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^@\s/]+)@/gi, '$1[REDACTED]@')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(
      /([?&](?:password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|client[_-]?secret)=)[^&#\s]*/gi,
      '$1[REDACTED]',
    )
    .replace(
      /(["']?)(authorization|proxy-authorization|cookie|set-cookie)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^,}\]]+)/gi,
      '$1$2$1=[REDACTED]',
    )
    .replace(
      /(["']?)(password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|api[_-]?key|x-api-key|secret|client[_-]?secret|database[_-]?url|redis[_-]?url|connection[_-]?string|dsn)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
      '$1$2$1=[REDACTED]',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}
/**
 * /u2028 行分隔符
 * /u2029 段落分隔符
 * @param error
 * @returns
 */
function sanitizeStackFrame(error: Error): string[] | undefined {
  if (!error.stack || /[\r\n\u2028\u2029]/.test(error.message)) {
    return undefined
  }

  const frames = error.stack
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, MAX_LOG_STACK_FRAMES)
    .map((line) => sanitizeLogText(line, MAX_LOG_FRAME_LENGTH))
    .filter(Boolean)
  return frames.length ? frames : undefined
}

function serializeError(value: unknown, depth = 0): Record<string, unknown> {
  if (!(value instanceof Error)) {
    return {
      type: typeof value,
    }
  }

  const stackFrames = sanitizeStackFrame(value)
  const result: Record<string, unknown> = {
    name: sanitizeLogText(value.name, 120) || 'Error',
    message: sanitizeLogText(value.message, MAX_LOG_MESSAGE_LENGTH),
    ...(stackFrames ? { stackFrames } : {}),
  }
  if (depth < 2 && value.cause !== undefined) {
    result.cause = serializeError(value.cause, depth + 1)
  }
  return result
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  private getZodDetails(exception: ZodValidationException): ApiErrorDetail[] | undefined {
    const zodError = exception.getZodError()

    if (!(zodError instanceof ZodError)) {
      return undefined
    }

    const details = zodError.issues.slice(0, MAX_DETAIL_COUNT).map((issue) => {
      const path = cleanPublicText(issue.path.map(String).join('.'), MAX_DETAIL_PATH_LENGTH)
      const message = cleanPublicText(issue.message, MAX_PUBLIC_MESSAGE_LENGTH) || '请求内容无效'

      return {
        ...(path ? { path } : {}),
        code: cleanDetailCode(issue.code),
        message,
      }
    })
    return details.length ? details : undefined
  }

  private normalizeLegacyHttpException(exception: HttpException): NormalizedFailure {
    const status = normalizeStatus(exception.getStatus())

    if (status >= 500) {
      const serviceUnavailabel =
        status === HttpStatus.BAD_GATEWAY ||
        status === HttpStatus.SERVICE_UNAVAILABLE ||
        status === HttpStatus.GATEWAY_TIMEOUT

      return {
        status,
        body: serviceUnavailabel
          ? {
              code: COMMON_ERRORS.SERVICE_UNAVAILABLE.code,
              message: COMMON_ERRORS.SERVICE_UNAVAILABLE.publicMessage,
            }
          : {
              code: COMMON_ERRORS.INTERNAL_SERVER_ERROR.code,
              message: COMMON_ERRORS.INTERNAL_SERVER_ERROR.publicMessage,
            },
        cause: exception,
      }
    }

    const publicError = PUBLIC_HTTP_ERRORS[status] ?? {
      code: 'COMMON.HTTP_' + status,
      message: '请求处理失败',
    }
    return {
      status,
      body: publicError,
      bearerChallenge: status === HttpStatus.UNAUTHORIZED,
    }
  }

  private normalize(exception: unknown): NormalizedFailure {
    if (exception instanceof ZodSerializationException) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: {
          code: COMMON_ERRORS.INTERNAL_SERVER_ERROR.code,
          message: COMMON_ERRORS.INTERNAL_SERVER_ERROR.publicMessage,
        },
        cause: exception.getZodError() ?? exception,
      }
    }

    if (exception instanceof ZodValidationException) {
      const details = this.getZodDetails(exception)

      return {
        status: COMMON_ERRORS.VALIDATION_FAILED.status,
        body: {
          code: COMMON_ERRORS.VALIDATION_FAILED.code,
          message: COMMON_ERRORS.VALIDATION_FAILED.publicMessage,
          ...(details?.length ? { details } : {}),
        },
      }
    }

    if (exception instanceof AppException) {
      const status = normalizeStatus(exception.getStatus())
      const details = normalizeDetails(exception.details)
      const message =
        cleanPublicText(exception.definition.publicMessage, MAX_PUBLIC_MESSAGE_LENGTH) ||
        '请求处理失败'
      return {
        status,
        body: {
          code: exception.definition.code,
          message,
          ...(details?.length ? { details } : {}),
        },
        cause: status >= 500 ? (exception.cause ?? exception) : undefined,
        bearerChallenge: exception.definition.bearerChallenge,
      }
    }

    if (exception instanceof HttpException) {
      return this.normalizeLegacyHttpException(exception)
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: COMMON_ERRORS.INTERNAL_SERVER_ERROR.code,
        message: COMMON_ERRORS.INTERNAL_SERVER_ERROR.publicMessage,
      },
      cause: exception,
    }
  }

  private logServerFailure(
    exception: unknown,
    normalized: NormalizedFailure,
    request: FastifyRequest,
    requestId: string,
  ): void {
    const route = request.routeOptions?.url ?? 'unmatched'
    const cause = normalized.cause ?? exception

    this.logger.error({
      event: 'http_request_failed',
      requestId,
      method: request.method,
      route,
      status: normalized.status,
      code: normalized.body.code,
      error: serializeError(cause),
    })
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<FastifyRequest>()
    const response = http.getResponse<FastifyReply>()
    const requestId = String(request.id)
    const normalized = this.normalize(exception)
    const { httpAdapter } = this.adapterHost

    // 只记录服务器错误 业务错误不记录
    if (normalized.status >= 500) {
      this.logServerFailure(exception, normalized, request, requestId)
    }

    // 如果响应头已经被发送了 则直接结束响应 不再进行后面发的处理
    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response)
      return
    }

    httpAdapter.setHeader(response, 'x-request-id', requestId)

    /** 如果是未授权错误 则添加WWW-Authenticate 头 相当于告诉客户 请使用Bearer 认证
     * 为什么使用 normalized.bearerChallenge 而不是 normalized.status === HttpStatus.UNAUTHORIZED
     * 因为 normalized.status === HttpStatus.UNAUTHORIZED 只是告诉客户 授权有问题
     * 以下情况 bearerChallenge 为 false
     * 账号被禁用/锁定、权限不足、API Key 认证失败 、Basic Auth 失败、IP / 网络层拦截、Session/Cookie 失效
     * 为true 的场景
     * 应该设为 true 的场景
      异常类型	原因	为什么需要 Bearer 质询
      Token 缺失	请求头没有 Authorization	客户端需要知道“这里要传 Bearer Token”
      Token 格式错误	不是合法的 JWT / 签名不对	客户端可能传错了 Token 类型或损坏了
      Token 过期	exp 时间已过	客户端需要用 refresh_token 换取新 Token
      Token 签发者/受众不匹配	iss / aud 校验失败	客户端用了错误环境的 Token
      Token 被吊销	在黑名单 / 撤销列表中	客户端需要重新获取 Token
     */
    if (normalized.bearerChallenge) {
      httpAdapter.setHeader(response, 'www-authenticate', 'Bearer realm="api"')
    }

    httpAdapter.reply(response, normalized.body, normalized.status)
  }
}
