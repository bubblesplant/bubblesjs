import { Fragment, type ReactNode } from 'react'
import { i18n, type AppLocale } from './i18n'

interface I18nProviderProps {
  initialLocale?: AppLocale
  children: ReactNode
}

const I18nProvider = ({ initialLocale = i18n.locale, children }: I18nProviderProps) => {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    return i18n.subscribe(() => {
      setVersion((value) => value + 1)
    })
  }, [])

  useEffect(() => {
    if (initialLocale !== i18n.locale) {
      void i18n.loadAndActivate(initialLocale)
    }
  }, [initialLocale])

  return <Fragment key={version}>{children}</Fragment>
}

export default I18nProvider
