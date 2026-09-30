import { enUSIntl, zhCNIntl, type IntlType } from '@ant-design/pro-components'
import type { Locale as AntdLocale } from 'antd/es/locale'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'
import type { AppLocale } from './config'
import { APP_LOCALE_ADAPTERS } from './config'

const antdLocales: Record<string, AntdLocale> = { en_US: enUS, zh_CN: zhCN }
const proLocales: Record<string, IntlType> = { 'en-US': enUSIntl, 'zh-CN': zhCNIntl }

/**
 * 返回与应用语言匹配的 antd、Pro Components 和 Day.js 配置。
 *
 * 该适配器只负责静态映射；实际的 Day.js 全局切换仍由 App 在 locale 变化后执行，
 * 以保证 Pro Components 内部副作用不会覆盖应用最终选择。
 */
export function getUiLocale(locale: AppLocale): {
  antd: AntdLocale
  pro: IntlType
  dayjs: string
  document: string
} {
  const adapter = APP_LOCALE_ADAPTERS[locale]
  return {
    antd: antdLocales[adapter.antd] ?? zhCN,
    pro: proLocales[adapter.pro] ?? zhCNIntl,
    dayjs: adapter.dayjs,
    document: adapter.document,
  }
}
