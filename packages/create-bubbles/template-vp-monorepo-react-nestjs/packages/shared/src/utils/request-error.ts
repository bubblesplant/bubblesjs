/** 读取请求失败响应中的公开文案，兼容普通异常；保留原始错误对象与客户端错误码。 */
export function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data
      if (
        typeof data === 'object' &&
        data !== null &&
        'message' in data &&
        typeof data.message === 'string' &&
        data.message
      ) {
        return data.message
      }
    }
  }

  return error instanceof Error ? error.message : fallback
}
