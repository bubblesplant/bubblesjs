import { HttpStatus } from '@nestjs/common'

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
}
