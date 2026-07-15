import type { I18nStore } from '@bubblesjs/i18n-core'
import type { InjectionKey } from 'vue'

export const I18nScopeKey: InjectionKey<InjectionKey<I18nStore>> = Symbol('i18n-scope')

export const useI18n = () => {
  const storeKey = inject(I18nScopeKey)
  if (!storeKey) throw new Error('useI18n must be used within I18nProvider')
  const store = inject(storeKey)
  if (!store) throw new Error('useI18n must be used within I18nProvider')

  const state = shallowRef(store.getState())
  const unsubscribe = store.subscribe(() => {
    state.value = store.getState()
  })

  onScopeDispose(unsubscribe)

  return {
    locale: state.value.locale,
    tr: state.value.tr,
    loadLocale: state.value.loadLocale,
  }
}
