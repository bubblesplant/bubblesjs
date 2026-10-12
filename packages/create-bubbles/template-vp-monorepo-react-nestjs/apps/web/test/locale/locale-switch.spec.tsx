// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const i18n = vi.hoisted(() => ({
  locale: 'zh_CN',
  loadLocale: vi.fn<(locale: string) => Promise<void>>(),
}))
const registry = vi.hoisted(() => {
  const all = ['zh_CN', 'en_US', 'ja_JP', 'es_ES', 'de_DE', 'fr_FR'] as const
  return { all, locales: [...all] }
})

vi.mock('@bubblesjs/i18n-react', () => ({
  useI18n: () => ({
    locale: i18n.locale,
    loadLocale: i18n.loadLocale,
    tr: (key: string) => key,
  }),
}))

vi.mock('../../src/i18n/config', async (importOriginal) => {
  const config = await importOriginal<typeof import('../../src/i18n/config')>()
  return {
    ...config,
    APP_LOCALES: registry.locales,
    APP_LOCALE_LABELS: {
      ...config.APP_LOCALE_LABELS,
      ja_JP: { nativeName: '日本語', languageTag: 'ja', englishName: 'Japanese' },
      es_ES: { nativeName: 'Español', languageTag: 'es', englishName: 'Spanish' },
      de_DE: { nativeName: 'Deutsch', languageTag: 'de', englishName: 'German' },
      fr_FR: { nativeName: 'Français', languageTag: 'fr', englishName: 'French' },
    },
    APP_LOCALE_ADAPTERS: {
      ...config.APP_LOCALE_ADAPTERS,
      ja_JP: { antd: 'ja_JP', pro: 'ja-JP', dayjs: 'ja', document: 'ja-JP' },
      es_ES: { antd: 'es_ES', pro: 'es-ES', dayjs: 'es', document: 'es-ES' },
      de_DE: { antd: 'de_DE', pro: 'de-DE', dayjs: 'de', document: 'de-DE' },
      fr_FR: { antd: 'fr_FR', pro: 'fr-FR', dayjs: 'fr', document: 'fr-FR' },
    },
    isAppLocale: (locale: unknown) => registry.locales.some((registered) => registered === locale),
  }
})

import { ConfigProvider } from 'antd'
import LocaleSwitch from '../../src/components/LocaleSwitch/LocaleSwitch'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  document.body.replaceChildren()
  registry.locales.splice(0, registry.locales.length, ...registry.all)
  i18n.locale = 'zh_CN'
  i18n.loadLocale.mockReset()
  i18n.loadLocale.mockImplementation(async (locale) => {
    i18n.locale = locale
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  flushSync(() =>
    root.render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <LocaleSwitch />
      </ConfigProvider>,
    ),
  )
})

afterEach(() => {
  flushSync(() => root.unmount())
  document.body.replaceChildren()
})

/** 获取真实 AntD 触发按钮，缺失时提供明确测试错误。 */
function trigger() {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="切换语言"]')
  if (!button) throw new Error('未渲染语言切换入口')
  return button
}

/** 获取浮层内搜索输入，避免仅凭文案推断打开状态。 */
function searchInput() {
  const input = document.body.querySelector<HTMLInputElement>('input[aria-label="搜索语言"]')
  if (!input) throw new Error('语言搜索输入未打开')
  return input
}

/** 返回原生按钮构成的实际语言列表。 */
function languageItems() {
  return [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
}

/** 以原生语言名查找可交互选项。 */
function languageItem(name: string) {
  const item = languageItems().find((button) => button.querySelector('bdi')?.textContent === name)
  if (!item) throw new Error(`未找到语言选项：${name}`)
  return item
}

/** 搜索存在时聚焦输入，否则聚焦当前语言项；无匹配当前项时退至首项。 */
function openingFocusTarget() {
  return (
    document.body.querySelector<HTMLInputElement>('input[aria-label="搜索语言"]') ??
    languageItems().find((item) => item.getAttribute('aria-checked') === 'true') ??
    languageItems()[0]
  )
}

/** 点击入口并等待 Popover 聚焦当前布局的主要控件。 */
async function openPopover() {
  flushSync(() => trigger().click())
  await vi.waitFor(() => {
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(openingFocusTarget())
  })
}

/** 从原生输入事件更新受控搜索值，绕过 React 的值追踪器赋值。 */
function search(value: string) {
  const input = searchInput()
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  if (!descriptor?.set) throw new Error('输入框缺少原生 value setter')
  flushSync(() => {
    descriptor.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** 发送可冒泡键盘事件，测试浮层及文档的实际焦点处理。 */
function key(element: HTMLElement, value: string) {
  flushSync(() =>
    element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })),
  )
}

/** 暂停语言加载，返回完成函数以检查浮层关闭或重新打开后的异步行为。 */
function pauseLoad() {
  let finish: (() => void) | undefined
  i18n.loadLocale.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)))
  return () => finish?.()
}

describe('可搜索语言 Popover', () => {
  it('展示注册的多语言和当前项勾选，点击当前项关闭且不调用加载器', async () => {
    await openPopover()
    expect(languageItems()).toHaveLength(6)
    expect(languageItem('日本語')).toBeDefined()
    expect(languageItem('Français')).toBeDefined()
    expect(document.body.querySelector('.ant-popover-arrow')).not.toBeNull()
    const current = languageItem('简体中文')
    expect(current.getAttribute('aria-checked')).toBe('true')
    expect(current.querySelector('.anticon-check')).not.toBeNull()
    expect(languageItem('English').getAttribute('aria-checked')).toBe('false')

    flushSync(() => current.click())
    expect(i18n.loadLocale).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
    expect(document.activeElement).toBe(trigger())
  })

  it.each([2, 5])('注册 %i 种语言时隐藏搜索并聚焦非首项的当前语言', async (count) => {
    registry.locales.splice(count)
    i18n.locale = 'en_US'
    await openPopover()
    expect(languageItems()).toHaveLength(count)
    expect(document.body.querySelector('input[aria-label="搜索语言"]')).toBeNull()
    expect(document.activeElement).toBe(languageItem('English'))
    expect(languageItem('English')).not.toBe(languageItems()[0])
  })

  it('当前语言及默认语言未注册时，无搜索浮层聚焦首个可用语言', async () => {
    registry.locales.splice(0, registry.locales.length, 'en_US')
    await openPopover()
    expect(document.body.querySelector('input[aria-label="搜索语言"]')).toBeNull()
    expect(languageItem('English').getAttribute('aria-checked')).toBe('false')
    expect(document.activeElement).toBe(languageItems()[0])
  })

  it('搜索支持原生名、大小写英文、语言代码和空结果，关闭重开后清空搜索', async () => {
    await openPopover()
    for (const { query, expected } of [
      { query: '日本語', expected: '日本語' },
      { query: '  eNgLiSh  ', expected: 'English' },
      { query: 'FR_fr', expected: 'Français' },
      { query: 'ja-JP', expected: '日本語' },
    ]) {
      search(query)
      expect(languageItems()).toHaveLength(1)
      expect(searchInput().value).toBe(query)
      expect(languageItems()[0]?.querySelector('bdi')?.textContent).toBe(expected)
    }
    search('unknown-language')
    expect(languageItems()).toHaveLength(0)
    expect(searchInput().value).toBe('unknown-language')
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('没有匹配的语言')

    key(searchInput(), 'Escape')
    await openPopover()
    expect(searchInput().value).toBe('')
    expect(languageItems()).toHaveLength(6)
    expect(document.body.querySelector('[role="status"]')).toBeNull()
  })

  it('加载成功后关闭并归还焦点，重开显示新当前语言', async () => {
    await openPopover()
    search('French')
    flushSync(() => languageItem('Français').click())
    await vi.waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
    expect(i18n.loadLocale).toHaveBeenCalledExactlyOnceWith('fr_FR')
    expect(document.activeElement).toBe(trigger())

    await openPopover()
    expect(languageItems()).toHaveLength(6)
    expect(languageItem('Français').getAttribute('aria-checked')).toBe('true')
  })

  it('挂起加载时同步阻止重复请求，保留图标入口并在选项内展示等待状态', async () => {
    const finish = pauseLoad()
    await openPopover()
    const english = languageItem('English')
    flushSync(() => {
      english.click()
      english.click()
    })
    expect(i18n.loadLocale).toHaveBeenCalledExactlyOnceWith('en_US')
    expect(trigger().getAttribute('aria-busy')).toBe('true')
    expect(trigger().querySelector('.anticon-translation')).not.toBeNull()
    expect(trigger().querySelector('.anticon-loading')).toBeNull()
    expect(english.getAttribute('aria-disabled')).toBe('true')
    expect(english.querySelector('.anticon-loading')).not.toBeNull()

    flushSync(() => languageItem('简体中文').click())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(i18n.loadLocale).toHaveBeenCalledTimes(1)
    finish()
    await vi.waitFor(() => {
      expect(trigger().getAttribute('aria-expanded')).toBe('false')
      expect(trigger().getAttribute('aria-busy')).toBe('false')
    })
  })

  it('hook 抛出失败时保留浮层、提示并允许重试；不据此断言核心加载器回滚', async () => {
    i18n.loadLocale.mockRejectedValueOnce(new Error('模拟 hook 拒绝'))
    await openPopover()
    flushSync(() => languageItem('English').click())
    await vi.waitFor(() => {
      expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
        '语言切换失败，请重试',
      )
      expect(languageItem('English').getAttribute('aria-disabled')).toBe('false')
    })
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(trigger().getAttribute('aria-busy')).toBe('false')

    flushSync(() => languageItem('English').click())
    await vi.waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
    expect(i18n.loadLocale).toHaveBeenCalledTimes(2)
    expect(i18n.loadLocale).toHaveBeenLastCalledWith('en_US')
  })

  it.each([
    { name: '关闭后旧请求完成不抢走外部控件的焦点', reopen: false },
    { name: '关闭并重开后旧请求完成不收起新浮层或抢走当前项焦点', reopen: true },
  ])('$name', async ({ reopen }) => {
    registry.locales.splice(2)
    const finish = pauseLoad()
    await openPopover()
    flushSync(() => languageItem('English').click())
    expect(trigger().getAttribute('aria-busy')).toBe('true')

    const external = document.createElement('button')
    external.textContent = '浮层外部控件'
    document.body.append(external)
    flushSync(() => external.focus())
    await vi.waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
    expect(document.activeElement).toBe(external)
    if (reopen) await openPopover()

    finish()
    await vi.waitFor(() => expect(trigger().getAttribute('aria-busy')).toBe('false'))
    expect(trigger().getAttribute('aria-expanded')).toBe(String(reopen))
    expect(document.activeElement).toBe(reopen ? languageItem('简体中文') : external)
    expect(i18n.loadLocale).toHaveBeenCalledExactlyOnceWith('en_US')
  })

  it('方向键可从搜索进入并循环，Home/End 定位，Escape 关闭并恢复入口焦点', async () => {
    await openPopover()
    key(searchInput(), 'ArrowDown')
    expect(document.activeElement).toBe(languageItem('简体中文'))
    key(languageItem('简体中文'), 'ArrowUp')
    expect(document.activeElement).toBe(languageItem('Français'))
    key(languageItem('Français'), 'Home')
    expect(document.activeElement).toBe(languageItem('简体中文'))
    key(languageItem('简体中文'), 'End')
    expect(document.activeElement).toBe(languageItem('Français'))
    key(languageItem('Français'), 'ArrowDown')
    expect(document.activeElement).toBe(languageItem('简体中文'))
    key(languageItem('简体中文'), 'Escape')
    await vi.waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
    expect(document.activeElement).toBe(trigger())
    expect(i18n.loadLocale).not.toHaveBeenCalled()
  })
})
