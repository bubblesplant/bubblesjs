import { formatMessage } from './format'
import type { MessageValues } from './format'
import { createStore } from './store'
import type {
  CreateI18nOptions,
  I18nInitOptions,
  I18nState,
  I18nStore,
  LoadMessages,
  Locale,
  Messages,
} from './types'

const emptyMessageLoader: LoadMessages = async () => undefined

export const createI18n = ({
  locale,
  message = {},
  storage,
  storageKey,
  loaderMessage = emptyMessageLoader,
}: CreateI18nOptions = {}): I18nStore => {
  const store: I18nStore = createStore<I18nState>(
    {
      locale,
      message,
      tr: (key: string, values?: MessageValues): string =>
        formatMessage(store.getState().message[key] ?? key, values),
      loadLocale: async (nextLocale) => {
        let nextMessages: Messages = {}
        try {
          nextMessages = (await loaderMessage(nextLocale)) ?? {}
        } catch (error) {
          console.warn(`Failed to load locale file for ${nextLocale}:`, error)
        }
        store.setState((state) => ({
          ...state,
          locale: nextLocale,
          message: nextMessages,
        }))
      },
    },
    ({ newState }) => {
      if (storage && storageKey) storage.setItem(storageKey, newState.locale)
    },
  )

  return store
}

export async function initI18n(options: I18nInitOptions = {}): Promise<I18nStore> {
  const { storageKey, storage, locale: defaultLocale, loaderMessage } = options
  const loadMessages = loaderMessage ?? emptyMessageLoader
  const locale =
    storageKey && storage ? (storage.getItem<Locale>(storageKey) ?? defaultLocale) : defaultLocale

  let messages: Messages = {}
  try {
    messages = (await loadMessages(locale)) ?? {}
  } catch (error) {
    console.warn(`Failed to load locale file for ${locale}:`, error)
  }

  return createI18n({ locale, message: messages, storage, storageKey, loaderMessage: loadMessages })
}

export const createI18nStore = createI18n

export class i18n {
  static init(options?: I18nInitOptions): Promise<I18nStore> {
    return initI18n(options)
  }
}
