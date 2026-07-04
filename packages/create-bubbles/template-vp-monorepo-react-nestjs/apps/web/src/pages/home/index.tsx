import I18nProvider, { useI18n } from '@/I18n'
import { createJsonStorage } from '@/I18n/middle'
import { i18n } from '@/I18n/i18n'
import { Button } from 'antd'

const leftStore = await i18n.init({
  locale: 'zh_CN',
  loaderMessage: async (locale?: string) => (await import(`@/locales/${locale}.json`))?.default,
  storageKey: 'i18n-home-left',
  storage: createJsonStorage(localStorage),
})

const rightStore = await i18n.init({
  locale: 'en_US',
  loaderMessage: async (locale?: string) => (await import(`@/locales/${locale}.json`))?.default,
  storageKey: 'i18n-home-right',
  storage: createJsonStorage(localStorage),
})

const I18nTestNode = ({ title, switchLocale }: { title: string; switchLocale: string }) => {
  const { t, loadLocale, locale } = useI18n()

  return (
    <section className="flex min-w-64 flex-col gap-3 rounded border border-gray-200 p-4">
      <h2 className="text-lg font-medium">{title}</h2>
      <div>{t('保存')}</div>
      <div>{t('你好1')}</div>
      <div>目前语言: {locale}</div>
      <Button onClick={() => void loadLocale(switchLocale)}>切换到 {switchLocale}</Button>
    </section>
  )
}

const Home = () => {
  return (
    <div className="flex min-h-screen w-full items-center justify-center gap-6 bg-white p-6">
      <I18nProvider store={leftStore}>
        <I18nTestNode title="节点 A" switchLocale="en_US" />
      </I18nProvider>

      <I18nProvider store={rightStore}>
        <I18nTestNode title="节点 B" switchLocale="zh_CN" />
      </I18nProvider>
    </div>
  )
}

export default Home
