export const APP_LOCALES = ['zh_CN', 'en_US'] as const

export type AppLocale = (typeof APP_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'zh_CN'
export const I18N_STORAGE_KEY = 'wanwu-locale'

/**
 * 将应用语言映射到组件库和日期库使用的 locale 标识。
 *
 * 应用词条使用下划线格式（`zh_CN` / `en_US`），而 Day.js 使用短横线或短名称；
 * 将映射集中在这里可以避免 antd、Pro Components 和 Day.js 在语言切换时出现漂移。
 */
export const APP_LOCALE_ADAPTERS = {
  zh_CN: {
    antd: 'zh_CN',
    pro: 'zh-CN',
    dayjs: 'zh-cn',
    document: 'zh-CN',
  },
  en_US: {
    antd: 'en_US',
    pro: 'en-US',
    dayjs: 'en',
    document: 'en',
  },
} as const satisfies Record<
  AppLocale,
  { antd: string; pro: string; dayjs: string; document: string }
>

/** 判断外部输入是否为前端支持的语言标识。 */
export function isAppLocale(locale: unknown): locale is AppLocale {
  return APP_LOCALES.includes(locale as AppLocale)
}

/** 根据浏览器首选语言选择应用初始语言，未匹配时回退到简体中文。 */
export function resolveBrowserLocale(language = navigator.language): AppLocale {
  return language.toLowerCase().startsWith('en') ? 'en_US' : DEFAULT_LOCALE
}
