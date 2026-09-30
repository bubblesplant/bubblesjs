import { describe, expect, it } from 'vitest'
import { getUiLocale } from '@/i18n/ui-locale'

describe('getUiLocale', () => {
  it('maps Simplified Chinese to all supported locale adapters', () => {
    const locale = getUiLocale('zh_CN')

    expect(locale.antd.locale).toBe('zh-cn')
    expect(locale.pro.locale).toBe('zh_CN')
    expect(locale.dayjs).toBe('zh-cn')
    expect(locale.document).toBe('zh-CN')
  })

  it('maps English to all supported locale adapters', () => {
    const locale = getUiLocale('en_US')

    expect(locale.antd.locale).toBe('en')
    expect(locale.pro.locale).toBe('en_US')
    expect(locale.dayjs).toBe('en')
    expect(locale.document).toBe('en')
  })
})
