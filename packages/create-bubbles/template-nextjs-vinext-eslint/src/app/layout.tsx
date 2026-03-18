import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import AntdProvider from './antd-provider'

import 'virtual:uno.css'
import '@/styles/globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  authors: [{ name: '蜜蜂数联（重庆）智能科技有限公司' }],
  creator: '蜜蜂数联（重庆）智能科技有限公司',
  description:
    '蜜蜂数联（重庆）智能科技有限公司，专注工程管理数字化解决方案、数字孪生运维解决方案及AI+医疗领域，为政企客户提供全方位产业数字化转型服务。',
  keywords: [
    '蜜蜂数联',
    '蜜蜂数联（重庆）智能科技有限公司',
    '工程管理数字化解决方案',
    '数字孪生运维解决方案',
    'AI+医疗',
    '产业数字化',
    '重庆科技公司',
    '智能科技',
  ],
  openGraph: {
    description:
      '蜜蜂数联（重庆）智能科技有限公司，专注工程管理数字化解决方案、数字孪生运维解决方案及AI+医疗领域。',
    locale: 'zh_CN',
    siteName: '蜜蜂数联',
    title:
      '蜜蜂数联（重庆）智能科技有限公司 | 工程管理数字化 · 数字孪生运维 · AI+医疗',
    type: 'website',
  },
  publisher: '蜜蜂数联（重庆）智能科技有限公司',
  robots: {
    follow: true,
    googleBot: {
      follow: true,
      index: true,
    },
    index: true,
  },
  title: {
    default:
      '蜜蜂数联（重庆）智能科技有限公司 | 工程管理数字化 · 数字孪生运维 · AI+医疗',
    template: '%s | 蜜蜂数联',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable}  ${geistMono.variable}`}>
        <AntdProvider>{children}</AntdProvider>
      </body>
    </html>
  )
}
