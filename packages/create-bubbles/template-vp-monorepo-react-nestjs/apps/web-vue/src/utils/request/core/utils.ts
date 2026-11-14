/** 递归合并请求配置中的对象字段；数组和普通值由目标值替换。 */
export function deepMergeObject<T = any>(source: T, target: Partial<T>): T {
  /** 复制并合并当前层级，目标整体为 `undefined` 时保留来源值。 */
  const merge = (src: any, tgt: any): any => {
    if (!isPlainObject(src) || !isPlainObject(tgt)) {
      return tgt === undefined ? src : tgt
    }

    const result = { ...src }
    for (const key of Object.keys(tgt)) {
      const targetValue = tgt[key]
      result[key] = isPlainObject(targetValue) ? merge(result[key], targetValue) : targetValue
    }

    return result
  }

  return merge(source, target)
}

/** 根据对象标签判断是否为可按键读取和合并的对象。 */
export function isPlainObject(data: unknown): data is Record<string, any> {
  return Object.prototype.toString.call(data) === '[object Object]'
}

/** 在当前环境支持流 API 时判断响应体是否为可读流。 */
export function isReadableStream(data: unknown): boolean {
  if (typeof ReadableStream === 'undefined') return false
  return data instanceof ReadableStream
}

/** 尝试解析对象或数组形式的 JSON 字符串，其他输入或解析失败时原样返回。 */
export function tryParseJsonString(data: unknown): unknown {
  if (typeof data !== 'string') return data

  const value = data.trim()
  if (!value) return data

  if (!value.startsWith('{') && !value.startsWith('[')) return data

  try {
    return JSON.parse(value)
  } catch {
    return data
  }
}
