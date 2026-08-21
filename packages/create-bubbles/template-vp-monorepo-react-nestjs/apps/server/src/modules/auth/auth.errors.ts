import type { AppErrorDefinition } from '@/common/exceptions/app.exception'
import { HttpStatus } from '@nestjs/common'

export const AUTH_ERRORS = {
  SESSION_TOKEN_MISSING: {
    code: 'AUTH.SESSION_TOKEN_MISSING',
    publicMessage: '缺少有效的登录 Token',
    status: HttpStatus.UNAUTHORIZED,
    bearerChallenge: true,
  },
  SESSION_INVALID: {
    code: 'AUTH.SESSION_INVALID',
    publicMessage: '登录已失效，请重新登录',
    status: HttpStatus.UNAUTHORIZED,
    bearerChallenge: true,
  },
  CONTEXT_MISSING: {
    code: 'AUTH.CONTEXT_MISSING',
    publicMessage: '服务器内部错误',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  },
  INVALID_CREDENTIALS: {
    code: 'AUTH.INVALID_CREDENTIALS',
    publicMessage: '账号或密码错误',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  ACCOUNT_ALREADY_EXISTS: {
    code: 'AUTH.ACCOUNT_ALREADY_EXISTS',
    publicMessage: '账号已存在',
    status: HttpStatus.CONFLICT,
  },
  FORBIDDEN: {
    code: 'AUTH.FORBIDDEN',
    publicMessage: '没有权限执行此操作',
    status: HttpStatus.FORBIDDEN,
  },
  SERVICE_UNAVAILABLE: {
    code: 'AUTH.SERVICE_UNAVAILABLE',
    publicMessage: '登录服务暂时不可用，请稍后重试',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
} as const satisfies Record<string, AppErrorDefinition>
