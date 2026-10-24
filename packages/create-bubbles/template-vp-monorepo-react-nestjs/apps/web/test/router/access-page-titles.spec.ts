// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { ACCESS_PAGE_CATALOG } from 'shared/utils'
import { appI18nStore } from '../../src/i18n'
import enUS from '../../src/locales/en_US.json'
import zhCN from '../../src/locales/zh_CN.json'
import { pageRegistry, registeredRouteKeys } from '../../src/router/access-pages/registry'

const initialLocale = appI18nStore.getState().locale ?? 'zh_CN'

beforeEach(async () => {
  await appI18nStore.getState().loadLocale('zh_CN')
})

afterEach(async () => {
  await appI18nStore.getState().loadLocale(initialLocale)
})

describe('共享页面标题的国际化', () => {
  it('共享标题均具备中英文词条，切换语言后已有注册对象读取最新标题', async () => {
    for (const routeKey of registeredRouteKeys) {
      const page = ACCESS_PAGE_CATALOG.find((item) => item.routeKey === routeKey)!
      expect(zhCN).toHaveProperty(page.title)
      expect(enUS).toHaveProperty(page.title)
      expect(pageRegistry[routeKey].title()).toBe(zhCN[page.title as keyof typeof zhCN])
    }

    await appI18nStore.getState().loadLocale('en_US')
    for (const routeKey of registeredRouteKeys) {
      const page = ACCESS_PAGE_CATALOG.find((item) => item.routeKey === routeKey)!
      expect(pageRegistry[routeKey].title()).toBe(enUS[page.title as keyof typeof enUS])
    }

    await appI18nStore.getState().loadLocale('zh_CN')
    expect(pageRegistry['company.organization'].title()).toBe('企业组织架构')
    expect(pageRegistry['project.organization'].title()).toBe('项目组织架构')
  })
})
