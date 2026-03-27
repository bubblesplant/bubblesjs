import { ConfigProvider } from 'antd'
import zhCN from 'antd/es/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { Suspense } from 'react'
import { RouterProvider } from 'react-router'

import PageLoading from '@/components/Loading/PageLoading'

import { router } from './router'

dayjs.locale('zh-cn')

function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ConfigProvider locale={zhCN}>
        <RouterProvider router={router} />
      </ConfigProvider>
    </Suspense>
  )
}

export default App
