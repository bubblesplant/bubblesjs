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
    /** 自带语言包加载 */
    activeLocale: (locale: LocaleType, _messages?: Record<string, string>) => {
      i18nStore.setState((state) => ({ ...state, messages: _messages, locale }))
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

export const i18n = {
  t: i18nStore.getState().t,
  activeLocale: i18nStore.getState().activeLocale,
  loadLocale: i18nStore.getState().loadLocale,
}
