import type { MessageValues } from './format'
import type { JsonStorage } from './storage'
import type { Store } from './store'

export type Locale = string
export type Messages = Record<string, string>
export type LoadMessages = (locale?: Locale) => Promise<Messages | undefined>

export interface I18nState {
  locale: Locale | undefined
  message: Messages
  tr: (key: string, values?: MessageValues) => string
  loadLocale: (locale: Locale) => Promise<void>
}

export type I18nStore = Store<I18nState>

export interface CreateI18nOptions {
  locale?: Locale
  message?: Messages
  storage?: JsonStorage
  storageKey?: string
  loaderMessage?: LoadMessages
}

// Compatibility aliases for the API that lived in apps/web/src/I18n.
export type LocaleType = Locale
export type MessageType = Messages
export type messageType = Messages
export type LoadMessage = LoadMessages
export type I18nStoreState = I18nState
export type I18nStoreGetStateType = I18nState
export type I18nStoreType = I18nStore
export type CreateI18nStoreOptions = CreateI18nOptions

export type I18nInitOptions = Omit<CreateI18nOptions, 'message'>
