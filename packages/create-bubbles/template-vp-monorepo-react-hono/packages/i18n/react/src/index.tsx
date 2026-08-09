import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { I18nStore } from '@bubblesjs/i18n-core'
import { useI18nStore } from './use-store'

export interface I18nProviderProps {
  children: ReactNode
  store: I18nStore
}

export const I18nContext = createContext<I18nStore | undefined>(undefined)

export const useI18n = () => {
  const store = useContext(I18nContext)
  if (!store) throw new Error('useI18n must be used within I18nProvider')

  const { tr, loadLocale, locale } = useI18nStore(store)
  return { tr, loadLocale, locale }
}

export const I18nProvider = ({ children, store }: I18nProviderProps) => {
  return <I18nContext.Provider value={store}>{children}</I18nContext.Provider>
}

export { useI18nStore } from './use-store'
export default I18nProvider
