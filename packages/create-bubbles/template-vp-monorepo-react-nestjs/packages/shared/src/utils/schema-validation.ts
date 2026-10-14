import type { ApiErrorDetail, SchemaValidationIssue } from '../types/common'

/**
 * 把校验问题映射为统一错误详情，兼容普通路径和 Standard Schema 的 key 路径。
 * 保留校验器提供的错误码；缺少错误码时回退为 invalid。
 * 数量限制、控制字符清理和公开文本长度限制由 Server 全局异常过滤器负责。
 */
export function toValidationDetails(issues: readonly SchemaValidationIssue[]): ApiErrorDetail[] {
  return issues.map((issue) => {
    const path = issue.path
      ?.map((segment) => String(typeof segment === 'object' ? segment.key : segment))
      .join('.')

    return {
      ...(path ? { path } : {}),
      code: typeof issue.code === 'string' ? issue.code : 'invalid',
      message: issue.message,
    }
  })
}
