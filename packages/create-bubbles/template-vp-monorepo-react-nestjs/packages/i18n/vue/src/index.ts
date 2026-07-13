import {
  computed,
  defineComponent,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from 'vue'
import type { I18nStore } from '@bubblesjs/i18n-core'
import { useI18nStore } from './use-store'

/**
 * 注入 key：i18n store 通过 provide/inject 向后代传递。
 */
export const I18nKey: InjectionKey<I18nStore> = Symbol('i18n')

/**
 * 无渲染组件：只负责把 store 通过 provide 注入到后代组件，
 * 自身不渲染任何 DOM，渲染交给默认插槽。
 *
 * 用法：
 * ```vue
 * <I18nProvider :store="store">
 *   <App />
 * </I18nProvider>
 * ```
 */
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

/**
 * 在后代组件中消费 i18n：inject 取到 store，桥接成响应式状态，
 * 返回响应式的 tr / locale / loadLocale。
 */
export function useI18n() {
  const store = inject(I18nKey)
  if (!store) throw new Error('useI18n must be used within I18nProvider')

  const state = useI18nStore(store)
  const tr = computed(() => state.value.tr)
  const locale = computed(() => state.value.locale)
  const loadLocale = computed(() => state.value.loadLocale)
  return { tr, locale, loadLocale }
}

export { useI18nStore } from './use-store'
export default I18nProvider
