import { RESPONSE_SUCCESS_CODE, RESPONSE_SUCCESS_MSG } from '@/common/constants/response'

export class ResOp<T = any> {
  data?: T

  code: number

  message: string

  constructor(code: number, data: T, message = RESPONSE_SUCCESS_MSG) {
    this.code = code
    this.data = data
    this.message = message
  }

  static success<T>(data?: T, message?: string) {
    return new ResOp(RESPONSE_SUCCESS_CODE, data, message)
  }

  static error(code: number, message?: string) {
    return new ResOp(code, {}, message)
  }
}
