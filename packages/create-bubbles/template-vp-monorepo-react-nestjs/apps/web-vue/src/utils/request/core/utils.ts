export function deepMergeObject<T = any>(source: T, target: Partial<T>): T {
  const merge = (src: any, tgt: any): any => {
    if (!isPlainObject(src) || !isPlainObject(tgt))
      return tgt === undefined ? src : tgt

    const result = { ...src }
    for (const key of Object.keys(tgt)) {
      const targetValue = tgt[key]
      result[key] = isPlainObject(targetValue) ? merge(result[key], targetValue) : targetValue
    }

    return result
  }

  return merge(source, target)
}

export function isPlainObject(data: unknown): data is Record<string, any> {
  return Object.prototype.toString.call(data) === '[object Object]'
}

export function isReadableStream(data: unknown): boolean {
  if (typeof ReadableStream === 'undefined')
    return false
  return data instanceof ReadableStream
}

export function tryParseJsonString(data: unknown): unknown {
  if (typeof data !== 'string')
    return data

  const value = data.trim()
  if (!value)
    return data

  if (!value.startsWith('{') && !value.startsWith('['))
    return data

  try {
    return JSON.parse(value)
  }
  catch {
    return data
  }
}
