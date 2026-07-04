import type { ReactNode } from 'react'
import { useI18n } from './i18n'

interface I18nProviderProps {
  children: ReactNode
}

const I18nProvider = ({ children }: I18nProviderProps) => {
  useI18n()

  return children
}

export default I18nProvider
