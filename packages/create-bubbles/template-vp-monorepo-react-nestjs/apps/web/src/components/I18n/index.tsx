import type { ReactNode } from 'react'
import { useI18n, type LocaleType } from './i18n'

interface I18nProviderProps {
  locale?: LocaleType
  children: ReactNode
}

const I18nProvider = ({ locale, children }: I18nProviderProps) => {
  const { loadLocale } = useI18n()

  useEffect(() => {
    loadLocale(locale)
  }, [locale])

  return children
}

export default I18nProvider
