export function deepMergeObject<T = any>(source: T, target: Partial<T>): T {
  const isObject = (obj: any): obj is Record<string, any> =>
    obj && typeof obj === 'object' && !Array.isArray(obj)

  const merge = (src: any, tgt: any): any => {
    const result = { ...src }
    if (isObject(result) && isObject(tgt)) {
      Object.keys(tgt).forEach((key) => {
        if (isObject(tgt[key])) {
          result[key] = merge(result[key] || {}, tgt[key])
        }
        else {
          result[key] = tgt[key]
        }
      })
    }
    return result
  }

  return merge(source, target)
}

/**
 * 判断一个变量是不是可读流
 */
export function isReadableStream(data: unknown): boolean {
  if (typeof ReadableStream === 'undefined')
    return false
  return data instanceof ReadableStream
}
