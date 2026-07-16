import { computed, onScopeDispose, shallowRef } from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import type { I18nState, I18nStore } from '@bubblesjs/i18n-core'

export function useI18nStore<T>(store: I18nStore, selector: (state: I18nState) => T): ComputedRef<T>
export function useI18nStore(store: I18nStore): ShallowRef<I18nState>
export function useI18nStore<T>(
  store: I18nStore,
  selector?: (state: I18nState) => T,
): ComputedRef<T> | ShallowRef<I18nState> {
  const state = shallowRef<I18nState>(store.getState())
  const unsubscribe = store.subscribe(() => {
    state.value = store.getState()
  })

  onScopeDispose(unsubscribe)

  return selector ? computed(() => selector(state.value)) : state
}
