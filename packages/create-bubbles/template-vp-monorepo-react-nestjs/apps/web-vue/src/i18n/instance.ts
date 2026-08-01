import { createJsonStorage, i18n } from '@bubblesjs/i18n-core'

// Initialization must finish before App renders so the first locale is available synchronously.
// eslint-disable-next-line antfu/no-top-level-await
export const leftStore = await i18n.init({
  locale: 'zh_CN',
  loaderMessage: async (locale?: string) => (await import(`@/locales/${locale}.json`))?.default,
  storageKey: 'i18n-home-left',
  storage: createJsonStorage(localStorage),
})
