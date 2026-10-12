import {
  CheckOutlined,
  LoadingOutlined,
  SearchOutlined,
  TranslationOutlined,
} from '@ant-design/icons'
import { useI18n } from '@bubblesjs/i18n-react'
import { Button, Input, Popover, type InputRef } from 'antd'
import {
  APP_LOCALES,
  APP_LOCALE_ADAPTERS,
  APP_LOCALE_LABELS,
  DEFAULT_LOCALE,
  isAppLocale,
  type AppLocale,
} from '@/i18n/config'
import styles from './LocaleSwitch.module.css'

export interface LocaleSwitchRef {
  show: () => void
  hide: () => void
}

interface LocaleSwitchProps {
  ref?: Ref<LocaleSwitchRef>
}

/** 用固定图标入口打开语言 Popover，语言超过五种时提供搜索，沿用既有加载与持久化行为。 */
export default function LocaleSwitch({ ref }: LocaleSwitchProps) {
  const { loadLocale, locale, tr } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pendingLocale, setPendingLocale] = useState<AppLocale | null>(null)
  const [error, setError] = useState(false)
  const pendingRef = useRef(false)
  const sessionRef = useRef(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<InputRef>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const activeLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE
  const displayNames = new Intl.DisplayNames([APP_LOCALE_ADAPTERS[activeLocale].document], {
    type: 'language',
  })
  const showSearch = APP_LOCALES.length > 5
  const search = showSearch ? query.trim().toLocaleLowerCase() : ''
  const items = APP_LOCALES.map((key) => {
    const label = APP_LOCALE_LABELS[key]
    return { key, ...label, description: displayNames.of(label.languageTag) ?? label.englishName }
  }).filter((item) =>
    [item.nativeName, item.description, item.englishName, item.key, item.key.replaceAll('_', '-')]
      .join(' ')
      .toLocaleLowerCase()
      .includes(search),
  )

  /** 每次打开都恢复完整列表，避免沿用上一次的搜索和错误状态。 */
  function show() {
    sessionRef.current += 1
    setQuery('')
    setError(false)
    setOpen(true)
  }

  /** 关闭浮层并清除搜索；焦点恢复由键盘或选择操作决定。 */
  function hide() {
    sessionRef.current += 1
    setOpen(false)
    setQuery('')
    setError(false)
  }

  useImperativeHandle(ref, () => ({ show, hide }))

  useEffect(() => {
    if (!open) return
    /** Escape 关闭并还原入口焦点。 */
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      hide()
      triggerRef.current?.focus({ preventScroll: true })
    }
    /** Tab 离开整个选择器时收起浮层，不抢占外部目标的焦点。 */
    function handleFocus(event: FocusEvent) {
      const target = event.target as Node | null
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) hide()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocus)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocus)
    }
  }, [open])

  /** 在语言菜单内移动焦点，支持搜索框进入、方向键循环和首末项定位。 */
  function focusItem(direction: 'first' | 'last' | 'next' | 'previous') {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    if (!buttons.length) return
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const index =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? buttons.length - 1
          : direction === 'next'
            ? (current + 1) % buttons.length
            : (current - 1 + buttons.length) % buttons.length
    buttons[index]?.focus({ preventScroll: true })
    buttons[index]?.scrollIntoView({ block: 'nearest' })
  }

  /** 阻止重复切换，完成后关闭；保留核心加载器既有的异常处理语义。 */
  async function handleLocaleChange(nextLocale: AppLocale) {
    if (pendingRef.current) return
    if (nextLocale === activeLocale) {
      hide()
      triggerRef.current?.focus({ preventScroll: true })
      return
    }
    pendingRef.current = true
    const requestSession = sessionRef.current
    setPendingLocale(nextLocale)
    setError(false)
    try {
      await loadLocale(nextLocale)
      if (requestSession === sessionRef.current) {
        const restoreFocus = panelRef.current?.contains(document.activeElement)
        hide()
        if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
      }
    } catch {
      if (requestSession === sessionRef.current) setError(true)
    } finally {
      pendingRef.current = false
      setPendingLocale(null)
    }
  }

  return (
    <Popover
      trigger="click"
      placement="bottom"
      arrow={{ pointAtCenter: true }}
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? show() : hide())}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) return
        if (showSearch) {
          searchRef.current?.focus({ preventScroll: true })
        } else {
          const target =
            listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
            listRef.current?.querySelector<HTMLButtonElement>('button')
          target?.focus({ preventScroll: true })
        }
      }}
      destroyOnHidden
      classNames={{ root: `locale-switch-popover ${styles.popover}`, container: styles.container }}
      content={
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={`${panelId}-title`}
          aria-busy={pendingLocale !== null}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            const isSearch = event.target === searchRef.current?.input
            const direction =
              event.key === 'ArrowDown'
                ? isSearch
                  ? 'first'
                  : 'next'
                : event.key === 'ArrowUp'
                  ? isSearch
                    ? 'last'
                    : 'previous'
                  : !isSearch && event.key === 'Home'
                    ? 'first'
                    : !isSearch && event.key === 'End'
                      ? 'last'
                      : null
            if (direction) {
              event.preventDefault()
              focusItem(direction)
            }
          }}
        >
          <div className={styles.heading}>
            <strong id={`${panelId}-title`}>{tr('选择语言')}</strong>
            <span lang="en">Language</span>
          </div>
          {showSearch && (
            <Input
              ref={searchRef}
              className={styles.search}
              aria-label={tr('搜索语言')}
              placeholder={tr('搜索语言')}
              prefix={<SearchOutlined aria-hidden="true" />}
              autoComplete="off"
              spellCheck={false}
              allowClear
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          <div ref={listRef} className={styles.list} role="menu" aria-label={tr('选择语言')}>
            {items.map((item) => (
              <button
                type="button"
                key={item.key}
                role="menuitemradio"
                aria-checked={item.key === activeLocale}
                aria-disabled={pendingLocale !== null}
                className={styles.item}
                onClick={() => void handleLocaleChange(item.key)}
              >
                <span className={styles.names}>
                  <bdi lang={item.languageTag}>{item.nativeName}</bdi>
                  <bdi className={styles.description}>{item.description}</bdi>
                </span>
                <span className={styles.indicator} aria-hidden="true">
                  {pendingLocale === item.key ? (
                    <LoadingOutlined spin />
                  ) : item.key === activeLocale ? (
                    <CheckOutlined />
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          {items.length === 0 && (
            <div className={styles.empty} role="status">
              {tr('没有匹配的语言')}
            </div>
          )}
          {error && (
            <div className={styles.error} role="alert">
              {tr('语言切换失败，请重试')}
            </div>
          )}
        </div>
      }
    >
      <Button
        ref={triggerRef}
        type="text"
        className={`locale-switch-trigger ${styles.trigger}`}
        icon={<TranslationOutlined />}
        aria-label={tr('切换语言')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-busy={pendingLocale !== null}
        title={tr('切换语言')}
      />
    </Popover>
  )
}
