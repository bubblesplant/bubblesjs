import type { ReactNode } from 'react'
import type { I18nStoreType } from './types'
import { useI18nStore } from './use-store'

interface I18nProviderProps {
  children: ReactNode
  store: I18nStoreType
}

export const I18nContext = createContext<I18nStoreType | undefined>(undefined)

export const useI18n = () => {
  const store = useContext(I18nContext)
  if (!store) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  const { t, loadLocale, locale } = useI18nStore(store)
  return { t, loadLocale, locale }
}

const I18nProvider = ({ children, store }: I18nProviderProps) => {
  return <I18nContext.Provider value={store}>{children}</I18nContext.Provider>
}

export default I18nProvider
