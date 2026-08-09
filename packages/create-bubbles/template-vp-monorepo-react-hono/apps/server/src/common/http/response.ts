export interface ApiResponse<T> {
  code: number
  data: T
  msg: string
}

export function apiSuccess<T>(data: T, msg = '操作成功'): ApiResponse<T> {
  return {
    code: 200,
    data,
    msg,
  }
}

export function apiFailure(code: number, msg: string, data: unknown = null): ApiResponse<unknown> {
  return {
    code,
    data,
    msg,
  }
}
