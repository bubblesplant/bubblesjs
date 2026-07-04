import type { JsonStorage } from './middle'
import type { createStore } from './store'

export type LocaleType = string

export type MessageType = Record<string, string>

export type messageType = MessageType

export type LoadMessage = (locale?: LocaleType) => Promise<MessageType | undefined>

export interface I18nStoreState {
  locale: LocaleType | undefined
  message: MessageType
  t: (key: string, values?: Record<string, string | number>) => string
  loadLocale: (locale: LocaleType) => Promise<void>
}

export type I18nStoreGetStateType = I18nStoreState

export type I18nStoreType = ReturnType<typeof createStore<I18nStoreState>>

export interface CreateI18nStoreOptions {
  locale?: LocaleType
  message?: MessageType
  storage?: JsonStorage
  storageKey?: string
  loaderMessage?: LoadMessage
}

export interface I18nInitOptions {
  storageKey?: string
  storage?: JsonStorage
  locale?: LocaleType
  localeFilePath?: string
  loaderMessage?: LoadMessage
}
