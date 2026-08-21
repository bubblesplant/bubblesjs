import { HttpStatus } from '@nestjs/common'
import { AppErrorDefinition } from '../exceptions/app.exception'

export const COMMON_ERRORS = {
  VALIDATION_FAILED: {
    code: 'COMMON.VALIDATION_FAILED',
    publicMessage: '请求参数校验失败',
    status: HttpStatus.BAD_REQUEST,
  },
  BAD_REQUEST: {
    code: 'COMMON.BAD_REQUEST',
    publicMessage: '请求内容无效',
    status: HttpStatus.BAD_REQUEST,
  },
  FORBIDDEN: {
    code: 'COMMON.FORBIDDEN',
    publicMessage: '没有权限执行此操作',
    status: HttpStatus.FORBIDDEN,
  },
  NOT_FOUND: {
    code: 'COMMON.NOT_FOUND',
    publicMessage: '请求的资源不存在',
    status: HttpStatus.NOT_FOUND,
  },
  TOO_MANY_REQUESTS: {
    code: 'COMMON.TOO_MANY_REQUESTS',
    publicMessage: '请求过于频繁，请稍后重试',
    status: HttpStatus.TOO_MANY_REQUESTS,
  },
  SERVICE_UNAVAILABLE: {
    code: 'COMMON.SERVICE_UNAVAILABLE',
    publicMessage: '服务暂时不可用，请稍后重试',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
  INTERNAL_SERVER_ERROR: {
    code: 'COMMON.INTERNAL_SERVER_ERROR',
    publicMessage: '服务器内部错误',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  },
} as const satisfies Record<string, AppErrorDefinition>
