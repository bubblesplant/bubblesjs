export const shallowEqualObject = <T>(a: T, b: T) => {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false
  }

  const aKeys = Object.keys(a)

  if (aKeys.length !== Object.keys(b).length) {
    return false
  }

  return aKeys.every((key) => Object.is(a[key as keyof T], b[key as keyof T]))
}

type ListenerType = () => void

export function createStore<T extends object>(
  initState: T,
  onChange: ({ newState, oldState }: { newState: T; oldState: T }) => void,
) {
  let state = initState
  const listeners = new Set<ListenerType>()

  return {
    getState: () => state,
    setState: (updater: (state: T) => T) => {
      const oldState = state
      const newState = updater(oldState)
      if (shallowEqualObject(newState, oldState)) {
        return
      }

      state = newState
      onChange({ newState, oldState })
      for (const listener of listeners) listener()
    },
    subscribe: (listener: ListenerType) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
