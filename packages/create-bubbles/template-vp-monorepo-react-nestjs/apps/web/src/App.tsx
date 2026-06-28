import { ConfigProvider } from 'antd'
import enUS from 'antd/es/locale/en_US'
import zhCN from 'antd/es/locale/zh_CN'
import { I18nProvider, useI18n } from '@bubbles/i18n'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { Suspense, useEffect } from 'react'
import { RouterProvider } from 'react-router'

import PageLoading from '@/components/Loading/PageLoading'
import { i18n, type AppLocale } from '@/i18n'

import { router } from './router/index.tsx'

dayjs.locale('zh-cn')

function AppContent() {
  const { locale } = useI18n<AppLocale>()

  useEffect(() => {
    dayjs.locale(locale === 'zh-CN' ? 'zh-cn' : 'en')
  }, [locale])

  return (
    <Suspense fallback={<PageLoading />}>
      <ConfigProvider locale={locale === 'zh-CN' ? zhCN : enUS}>
        <RouterProvider router={router} />
      </ConfigProvider>
    </Suspense>
  )
}

function App() {
  return (
    <I18nProvider i18n={i18n}>
      <AppContent />
    </I18nProvider>
  )
}

export default App
