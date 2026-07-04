import { formatMessage } from './format'
import { createStore } from './store'
import type {
  CreateI18nStoreOptions,
  I18nInitOptions,
  I18nStoreState,
  I18nStoreType,
  LocaleType,
  MessageType,
} from './types'

const defaultLoaderMessage = async (locale?: LocaleType) =>
  (await import(`@/locales/${locale}.json`))?.default

export const createI18nStore = ({
  locale,
  message,
  storage,
  storageKey,
  loaderMessage = defaultLoaderMessage,
}: CreateI18nStoreOptions): I18nStoreType => {
  const store: I18nStoreType = createStore<I18nStoreState>(
    {
      locale,
      message: message || {},
      t: (key: string, values?: Record<string, string | number>) => {
        return formatMessage(store.getState().message[key] ?? key, values)
      },
      loadLocale: async (locale: LocaleType) => {
        let message: MessageType = {}
        try {
          message = (await loaderMessage(locale)) || {}
        } catch (error) {
          console.warn(`Failed to load locale file for ${locale}:`, error)
        }
        store.setState((state) => ({ ...state, message: message || {}, locale }))
      },
    },
    ({ newState }) => {
      if (storage && storageKey) {
        storage.setItem(storageKey, newState.locale)
      }
    },
  )
  return store
}

export class i18n {
  static async init(options?: I18nInitOptions) {
    const {
      storageKey,
      storage,
      locale: defaultLocale,
      loaderMessage = defaultLoaderMessage,
    } = options ?? {}

    const locale =
      storageKey && storage
        ? ((storage.getItem(storageKey) as LocaleType) ?? defaultLocale)
        : defaultLocale

    let message: MessageType = {}
    try {
      message = (await loaderMessage(locale)) || {}
    } catch (error) {
      console.warn(`Failed to load locale file for ${locale}:`, error)
    }

    const store = createI18nStore({
      locale,
      message,
      storage,
      storageKey,
      loaderMessage,
    })
    return store
  }
}
