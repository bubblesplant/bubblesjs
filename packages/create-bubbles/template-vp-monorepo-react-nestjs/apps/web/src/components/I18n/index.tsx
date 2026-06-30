import { I18nContext, type AppLocale, type I18nMessages } from './hook'

const formatMessage = (message: string, values?: Record<string, string | number>) => {
  if (!values) return message
  return message.replace(/\{(\w+)\}/g, (match, key) => {
    return String(values[key] ?? match)
  })
}

const I18nProvider = (props) => {
  const { initialLocale = 'zh_CN', children } = props
  const [locale, setLocale] = useState<AppLocale>(initialLocale)
  const [messages, setMesssages] = useState<I18nMessages>({})
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    let canceled = false

    async function loadMesaages() {
      setLoading(true)
      try {
        const module = await import(`@/locales/${locale}.json`)
        if (!canceled) {
          setMesssages(module.default)
        }
      } finally {
        setLoading(false)
      }
    }

    void loadMesaages()

    return () => {
      canceled = true
    }
  }, [locale])

  const value = useMemo(
    () => ({
      locale,
      loading,
      setLocale,
      t: (key: string, values?: Record<string, string | number>) =>
        formatMessage(messages[key] ?? key, values),
    }),
    [locale, loading, messages],
  )

  if (!messages) return null

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export default I18nProvider
