import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { I18n, I18nSnapshot, LocaleCode } from './core'

const I18nContext = createContext<I18n | null>(null)

export interface I18nProviderProps<Locale extends LocaleCode = LocaleCode> {
  i18n: I18n<Locale>
  children: ReactNode
}

export interface UseI18nResult<
  Locale extends LocaleCode = LocaleCode,
> extends I18nSnapshot<Locale> {
  t: I18n<Locale>['t']
  format: I18n<Locale>['format']
  setLocale: I18n<Locale>['setLocale']
  getMessages: I18n<Locale>['getMessages']
  setMessages: I18n<Locale>['setMessages']
}

export function I18nProvider<Locale extends LocaleCode = LocaleCode>({
  i18n,
  children,
}: I18nProviderProps<Locale>) {
  return <I18nContext.Provider value={i18n as unknown as I18n}>{children}</I18nContext.Provider>
}

export function useI18n<Locale extends LocaleCode = LocaleCode>(): UseI18nResult<Locale> {
  const i18n = useContext(I18nContext) as I18n<Locale> | null

  if (!i18n) throw new Error('useI18n must be used within an I18nProvider.')

  const snapshot = useSyncExternalStore(i18n.subscribe, i18n.getSnapshot, i18n.getSnapshot)

  return useMemo(
    () => ({
      ...snapshot,
      t: i18n.t,
      format: i18n.format,
      setLocale: i18n.setLocale,
      getMessages: i18n.getMessages,
      setMessages: i18n.setMessages,
    }),
    [i18n, snapshot],
  )
}

export function useT<Locale extends LocaleCode = LocaleCode>(): I18n<Locale>['t'] {
  return useI18n<Locale>().t
}
