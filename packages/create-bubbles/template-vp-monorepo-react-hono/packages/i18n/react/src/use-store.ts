import { useSyncExternalStore } from 'react'
import type { I18nState, I18nStore } from '@bubblesjs/i18n-core'

export function useI18nStore<T>(store: I18nStore, selector: (state: I18nState) => T): T
export function useI18nStore(store: I18nStore): I18nState
export function useI18nStore<T>(
  store: I18nStore,
  selector?: (state: I18nState) => T,
): T | I18nState {
  if (selector) {
    return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
  }
  return useSyncExternalStore(store.subscribe, store.getState)
}
