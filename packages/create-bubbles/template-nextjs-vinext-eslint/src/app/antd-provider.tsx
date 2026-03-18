'use client'

import { StyleProvider } from '@ant-design/cssinjs'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

export default function AntdProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <StyleProvider>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            borderRadius: 8,
            colorLink: '#146ae1',
            colorPrimary: '#146ae1',
            fontFamily:
              'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif',
          },
        }}
      >
        {children}
      </ConfigProvider>
    </StyleProvider>
  )
}
