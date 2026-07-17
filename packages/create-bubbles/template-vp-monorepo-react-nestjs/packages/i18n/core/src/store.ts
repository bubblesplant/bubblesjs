export type StoreListener = () => void

export interface Store<T extends object> {
  getState: () => T
  setState: (updater: (state: T) => T) => void
  subscribe: (listener: StoreListener) => () => void
}

export const shallowEqualObject = <T>(a: T, b: T): boolean => {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false
  }

  const aKeys = Object.keys(a)

  if (aKeys.length !== Object.keys(b).length) {
    return false
  }

  return aKeys.every((key) => Object.is(a[key as keyof T], b[key as keyof T]))
}

export function createStore<T extends object>(
  initState: T,
  onChange: ({ newState, oldState }: { newState: T; oldState: T }) => void,
): Store<T> {
  let state = initState
  const listeners = new Set<StoreListener>()

  return {
    getState: () => state,
    setState: (updater) => {
      const oldState = state
      const newState = updater(oldState)
      if (shallowEqualObject(newState, oldState)) return

      state = newState
      onChange({ newState, oldState })
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
