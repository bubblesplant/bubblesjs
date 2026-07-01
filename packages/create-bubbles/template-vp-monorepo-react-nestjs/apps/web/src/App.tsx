import { ConfigProvider } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { Suspense } from 'react'
import { RouterProvider } from 'react-router'
import PageLoading from '@/components/Loading/PageLoading'
import { router } from './router'
import I18nProvider from '@/components/I18n'
import '@/locales/zh_CN.json'

dayjs.locale('zh-cn')

function App() {
  return (
    <I18nProvider locale="zh_CN">
      <Suspense fallback={<PageLoading />}>
        <ConfigProvider>
          <RouterProvider router={router} />
        </ConfigProvider>
      </Suspense>
    </I18nProvider>
  )
}

export default App
