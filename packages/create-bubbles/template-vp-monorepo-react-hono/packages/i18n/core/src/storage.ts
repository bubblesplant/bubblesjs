export interface StateStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export interface JsonStorage {
  getItem: <T>(key: string) => T | null
  setItem: <T>(key: string, value: T) => void
  removeItem: (key: string) => void
}

export const createJsonStorage = (storage?: StateStorage): JsonStorage => {
  const removeItem = (key: string) => {
    try {
      storage?.removeItem(key)
    } catch {
      // Persistence must never interrupt application rendering.
    }
  }

  return {
    getItem: <T>(key: string) => {
      try {
        const value = storage?.getItem(key)
        if (value === undefined || value === null) return null
        return JSON.parse(value) as T
      } catch {
        removeItem(key)
        return null
      }
    },
    setItem: <T>(key: string, value: T) => {
      try {
        const json = JSON.stringify(value)
        if (json === undefined) {
          removeItem(key)
          return
        }
        storage?.setItem(key, json)
      } catch {
        // Persistence must never interrupt application rendering.
      }
    },
    removeItem,
  }
}
