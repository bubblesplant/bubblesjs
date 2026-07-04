import { ConfigProvider } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { Suspense } from 'react'
import { RouterProvider } from 'react-router'
import PageLoading from '@/components/Loading/PageLoading'
import { router } from './router'

dayjs.locale('zh-cn')

// const i18nStore = await i18n.init()

function App() {
  return (
    // <I18nProvider store={i18nStore}>
    <Suspense fallback={<PageLoading />}>
      <ConfigProvider>
        <RouterProvider router={router} />
      </ConfigProvider>
    </Suspense>
    // </I18nProvider>
  )
}

export default App
