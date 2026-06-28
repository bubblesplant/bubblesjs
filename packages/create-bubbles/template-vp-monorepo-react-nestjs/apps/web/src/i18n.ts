import { createI18n, type I18nMessages } from '@bubbles/i18n'

export const appLocales = ['zh-CN', 'en-US'] as const

export type AppLocale = (typeof appLocales)[number]

export const sourceLocale: AppLocale = 'zh-CN'

const localeLoaders: Partial<Record<AppLocale, () => Promise<I18nMessages>>> = {
  'zh-CN': async () => (await import('@/locales/zh-CN.json')).default,
  'en-US': async () => (await import('@/locales/en-US.json')).default,
}

export const i18n = createI18n<AppLocale>({
  sourceLocale,
  initialLocale: sourceLocale,
  loadMessages: async (locale) => localeLoaders[locale]?.() ?? {},
})

export const t = i18n.t

export const setLocale = i18n.setLocale
