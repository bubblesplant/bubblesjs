import { createJsonStorage, i18n } from '@bubblesjs/i18n-core'

export const leftStore = await i18n.init({
  locale: 'zh_CN',
  loaderMessage: async (locale?: string) => (await import(`@/locales/${locale}.json`))?.default,
  storageKey: 'i18n-home-left',
  storage: createJsonStorage(localStorage),
})
