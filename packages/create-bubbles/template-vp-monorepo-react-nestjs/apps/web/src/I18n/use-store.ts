import type { I18nStoreState, I18nStoreType } from './types'

export function useI18nStore<T>(store: I18nStoreType, selector: (state: I18nStoreState) => T): T

export function useI18nStore(store: I18nStoreType): I18nStoreState

export function useI18nStore<T>(
  store: I18nStoreType,
  selector?: (state: I18nStoreState) => T,
): T | I18nStoreState {
  if (selector) {
    return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
  }
  return useSyncExternalStore(store.subscribe, store.getState)
}
