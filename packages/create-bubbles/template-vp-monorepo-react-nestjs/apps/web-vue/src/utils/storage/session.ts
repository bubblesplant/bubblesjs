/** 为本地或会话存储提供 JSON 序列化读写封装。 */
function createStorage(type: 'localStorage' | 'sessionStorage') {
  return {
    /** 自动序列化为 JSON；同名写入即为更新。 */
    set<T>(key: string, value: T): void {
      const serialized = JSON.stringify(value)
      if (serialized === undefined) throw new TypeError('存储值必须能够序列化为 JSON')
      window[type].setItem(key, serialized)
    },

    /** 不存在或内容不是有效 JSON 时返回 null。 */
    get<T = unknown>(key: string): T | null {
      const value = window[type].getItem(key)
      if (value === null) return null

      try {
        return JSON.parse(value) as T
      } catch {
        return null
      }
    },

    remove(key: string): void {
      window[type].removeItem(key)
    },

    clear(): void {
      window[type].clear()
    },
  }
}

export const local = createStorage('localStorage')
export const session = createStorage('sessionStorage')
