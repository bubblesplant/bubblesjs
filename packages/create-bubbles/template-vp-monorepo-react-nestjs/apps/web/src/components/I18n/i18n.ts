import zhCNMessages from '@/locales/zh_CN.json'

export type AppLocale = 'zh_CN' | 'en_US'
export type I18nMessages = Record<string, string>

const DEFAULT_LOCALE: AppLocale = 'zh_CN'

function formatMessage(message: string, values?: Record<string, string | number>) {
  if (!values) return message

  return message.replace(/\{(\w+)\}/g, (match, key) => {
    return String(values[key] ?? match)
  })
}

class I18n {
  locale: AppLocale
  messages: I18nMessages
  loading = false

  private messagesMap = new Map<AppLocale, I18nMessages>()
  private listeners = new Set<() => void>()

  constructor(locale: AppLocale, messages: I18nMessages) {
    this.locale = locale
    this.messages = messages
    this.load(locale, messages)
  }

  t = (key: string, values?: Record<string, string | number>) => {
    return formatMessage(this.messages[key] ?? key, values)
  }

  load = (locale: AppLocale, messages: I18nMessages) => {
    this.messagesMap.set(locale, messages)
  }

  activate = (locale: AppLocale) => {
    const messages = this.messagesMap.get(locale)

    if (!messages) {
      throw new Error(`Locale messages not loaded: ${locale}`)
    }

    this.locale = locale
    this.messages = messages
    this.notify()
  }

  loadAndActivate = async (locale: AppLocale) => {
    if (!this.messagesMap.has(locale)) {
      this.loading = true
      this.notify()

      try {
        const module = await import(`@/locales/${locale}.json`)
        this.load(locale, module.default)
      } finally {
        this.loading = false
      }
    }

    if (locale !== this.locale) {
      this.activate(locale)
      return
    }

    this.notify()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    this.listeners.forEach((listener) => listener())
  }
}

export const i18n = new I18n(DEFAULT_LOCALE, zhCNMessages)
