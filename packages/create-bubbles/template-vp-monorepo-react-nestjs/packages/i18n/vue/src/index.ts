import {
  computed,
  defineComponent,
  inject,
  provide,
  type ComputedRef,
  type InjectionKey,
  type PropType,
} from 'vue'
import type { I18nState, I18nStore } from '@bubblesjs/i18n-core'
import { useI18nStore } from './use-store'

export const I18nKey: InjectionKey<I18nStore> = Symbol('i18n')

export interface I18nProviderProps {
  store: I18nStore
}

export interface UseI18nReturn {
  tr: I18nState['tr']
  loadLocale: I18nState['loadLocale']
  locale: ComputedRef<I18nState['locale']>
}

export const I18nProvider = defineComponent({
  name: 'I18nProvider',
  props: {
    store: {
      type: Object as PropType<I18nStore>,
      required: true,
    },
  },
  setup(props, { slots }) {
    provide(I18nKey, props.store)
    return () => slots.default?.()
  },
})

export function useI18n(): UseI18nReturn {
  const store = inject(I18nKey)
  if (!store) throw new Error('useI18n must be used within I18nProvider')

  const state = useI18nStore(store)
  const tr: I18nState['tr'] = (key, values) => state.value.tr(key, values)
  const loadLocale: I18nState['loadLocale'] = (locale) => state.value.loadLocale(locale)
  const locale = computed(() => state.value.locale)

  return { tr, loadLocale, locale }
}

export { useI18nStore } from './use-store'
export default I18nProvider
