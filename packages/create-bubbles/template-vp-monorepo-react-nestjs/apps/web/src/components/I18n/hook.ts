export type AppLocale = 'zh_CN' | 'en_US'

export interface I18nContextValue {
  locale: AppLocale
  loading: boolean
  t: (key: string, values?: Record<string, string | number>) => string
  setLocale: (locale: AppLocale) => void
}

export const I18nContext = createContext<I18nContextValue>(null)

export type I18nMessages = Record<string, string>

export const useI18n = () => {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('useI18n must be used within I18nProvider.')
  }

  return context
}
