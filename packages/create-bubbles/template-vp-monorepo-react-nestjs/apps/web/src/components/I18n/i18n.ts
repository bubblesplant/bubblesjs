import { createStore } from './store'

export type LocaleType = 'zh_CN' | 'en_US'

const initState = {
  locale: undefined,
  messages: {},
}

function formatMessage(message: string, values?: Record<string, string | number>) {
  if (!values) return message

  return message.replace(/\{(\w+)\}/g, (match, key) => {
    return String(values[key] ?? match)
  })
}

export const i18nStore = createStore(
  {
    ...initState,
    t: (key: string, values?: Record<string, string | number>) => {
      return formatMessage(i18nStore.getState().messages[key] ?? key, values)
    },
    loadLocale: async (locale: LocaleType) => {
      const { default: messages } = await import(`@/locales/${locale}.json`)
      i18nStore.setState((state) => ({ ...state, messages, locale }))
    },
  },
  () => {},
)

export function useI18n() {
  return useSyncExternalStore(i18nStore.subscribe, i18nStore.getState)
}
