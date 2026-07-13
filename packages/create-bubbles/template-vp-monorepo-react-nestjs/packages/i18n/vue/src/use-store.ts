import { onScopeDispose, shallowRef } from 'vue'
import type { I18nState, I18nStore } from '@bubblesjs/i18n-core'

/**
 * 把外部 i18n store 桥接成 Vue 响应式状态。
 * store 变化时刷新 shallowRef，组件作用域销毁时自动取消订阅。
 */
export function useI18nStore(store: I18nStore) {
  const state = shallowRef<I18nState>(store.getState())
  const unsubscribe = store.subscribe(() => {
    state.value = store.getState()
  })
  onScopeDispose(unsubscribe)
  return state
}
