export function useI18n() {
  const store = inject(store.storageKey)
  if (!store)
    throw new Error('useI18n must be used within I18nProvider')
}
