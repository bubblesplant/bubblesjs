export type LocaleCode = string

export type I18nMessage = string

export type I18nMessages = Record<string, I18nMessage>

export type I18nValue = string | number | boolean | null | undefined

export type I18nValues = Record<string, I18nValue>

export type MaybePromise<T> = T | Promise<T>

export type I18nMessagesModule = I18nMessages | { default: I18nMessages }

export type I18nMessagesLoader<Locale extends LocaleCode = LocaleCode> = (
  locale: Locale,
) => MaybePromise<I18nMessagesModule>

export interface MissingMessageInfo<Locale extends LocaleCode = LocaleCode> {
  locale: Locale
  source: string
}

export interface CreateI18nOptions<Locale extends LocaleCode = LocaleCode> {
  sourceLocale: Locale
  initialLocale?: Locale
  initialMessages?: Partial<Record<Locale, I18nMessages>>
  loadMessages?: I18nMessagesLoader<Locale>
  onMissingMessage?: (info: MissingMessageInfo<Locale>) => void
}

export interface I18nSnapshot<Locale extends LocaleCode = LocaleCode> {
  locale: Locale
  sourceLocale: Locale
  loading: boolean
  version: number
}

export interface I18n<Locale extends LocaleCode = LocaleCode> {
  readonly sourceLocale: Locale
  getLocale: () => Locale
  getSnapshot: () => I18nSnapshot<Locale>
  getMessages: (locale?: Locale) => I18nMessages
  setLocale: (locale: Locale) => Promise<void>
  setMessages: (locale: Locale, messages: I18nMessages) => void
  subscribe: (listener: () => void) => () => void
  t: (source: string, values?: I18nValues) => string
  format: (message: string, values?: I18nValues) => string
}

function normalizeMessages(module: I18nMessagesModule): I18nMessages {
  const maybeDefault = (module as { default?: unknown }).default
  if (maybeDefault && typeof maybeDefault === 'object' && !Array.isArray(maybeDefault)) {
    return maybeDefault as I18nMessages
  }

  return module as I18nMessages
}

export function formatMessage(message: string, values?: I18nValues): string {
  if (!values) return message

  return message.replace(/\{([a-zA-Z_$][\w$]*)\}/g, (match, key) => {
    const value = values[key]
    return value === null || value === undefined ? match : String(value)
  })
}

export function createI18n<Locale extends LocaleCode = LocaleCode>(
  options: CreateI18nOptions<Locale>,
): I18n<Locale> {
  const { sourceLocale, loadMessages, onMissingMessage } = options
  const messagesByLocale = new Map<Locale, I18nMessages>()
  const listeners = new Set<() => void>()

  let locale = options.initialLocale ?? sourceLocale
  let loading = false
  let version = 0
  let loadRequestId = 0
  let snapshot: I18nSnapshot<Locale> = {
    locale,
    sourceLocale,
    loading,
    version,
  }

  if (options.initialMessages) {
    for (const [key, messages] of Object.entries(options.initialMessages)) {
      messagesByLocale.set(key as Locale, { ...(messages as I18nMessages) })
    }
  }

  const getSnapshot = (): I18nSnapshot<Locale> => snapshot

  const notify = () => {
    version += 1
    snapshot = {
      locale,
      sourceLocale,
      loading,
      version,
    }
    listeners.forEach((listener) => listener())
  }

  const getMessages = (targetLocale = locale): I18nMessages => {
    return messagesByLocale.get(targetLocale) ?? {}
  }

  const setMessages = (targetLocale: Locale, messages: I18nMessages) => {
    messagesByLocale.set(targetLocale, { ...messages })
    if (targetLocale === locale) notify()
  }

  const setLocale = async (nextLocale: Locale): Promise<void> => {
    const requestId = ++loadRequestId
    const shouldLoad =
      nextLocale !== sourceLocale && loadMessages !== undefined && !messagesByLocale.has(nextLocale)

    if (!shouldLoad) {
      locale = nextLocale
      loading = false
      notify()
      return
    }

    locale = nextLocale
    loading = true
    notify()

    try {
      const loadedMessages = await loadMessages(nextLocale)
      if (requestId !== loadRequestId) return

      messagesByLocale.set(nextLocale, normalizeMessages(loadedMessages))
    } finally {
      if (requestId === loadRequestId) {
        loading = false
        notify()
      }
    }
  }

  const t = (source: string, values?: I18nValues): string => {
    const messages = locale === sourceLocale ? undefined : messagesByLocale.get(locale)
    const message = messages?.[source]

    if (message === undefined && locale !== sourceLocale) {
      onMissingMessage?.({ locale, source })
    }

    return formatMessage(message ?? source, values)
  }

  return {
    sourceLocale,
    getLocale: () => locale,
    getSnapshot,
    getMessages,
    setLocale,
    setMessages,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    t,
    format: formatMessage,
  }
}
