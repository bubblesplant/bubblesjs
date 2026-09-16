import { useI18n } from '@bubblesjs/i18n-react'
import { Flex, Select, Spin, Tag, Typography } from 'antd'
import type {
  GlobalAccountOption,
  GlobalAccountSelectOption,
  GlobalAccountSelectProps,
} from './GlobalAccountSelectTypes'

const DEFAULT_MIN_SEARCH_LENGTH = 2
const DEFAULT_DEBOUNCE_MS = 300
const DEFAULT_PAGE_SIZE = 20

/** 远程搜索平台全局账号，以稳定 userId 作为单选值。 */
export default function GlobalAccountSelect({
  value,
  selectedAccount,
  request,
  minSearchLength = DEFAULT_MIN_SEARCH_LENGTH,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  pageSize = DEFAULT_PAGE_SIZE,
  placeholder,
  allowClear = true,
  onChange,
  ...selectProps
}: GlobalAccountSelectProps) {
  const { tr } = useI18n()
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<readonly GlobalAccountOption[]>([])
  const [currentAccount, setCurrentAccount] = useState(selectedAccount)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const requestRef = useRef(request)
  const requestSequence = useRef(0)
  requestRef.current = request

  /** 根据外部 userId、回显快照和最新结果同步当前选中账号。 */
  useEffect(() => {
    if (!value) {
      setCurrentAccount(undefined)
      return
    }
    if (selectedAccount?.id === value) {
      setCurrentAccount(selectedAccount)
      return
    }
    const loadedAccount = accounts.find((account) => account.id === value)
    setCurrentAccount((current) => loadedAccount ?? (current?.id === value ? current : undefined))
  }, [accounts, selectedAccount, value])

  /** 防抖查询候选账号，并取消或忽略已经失效的请求结果。 */
  useEffect(() => {
    const normalizedQuery = query.trim()
    const sequence = ++requestSequence.current
    setError(false)
    setAccounts([])

    if (normalizedQuery.length < minSearchLength) {
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      void requestRef
        .current({
          query: normalizedQuery,
          page: 1,
          pageSize,
          signal: controller.signal,
        })
        .then((result) => {
          if (requestSequence.current !== sequence || controller.signal.aborted) return
          const uniqueAccounts = new Map(
            result.items.map((account) => [account.id, account] as const),
          )
          setAccounts([...uniqueAccounts.values()])
        })
        .catch(() => {
          if (requestSequence.current !== sequence || controller.signal.aborted) return
          setAccounts([])
          setError(true)
        })
        .finally(() => {
          if (requestSequence.current === sequence && !controller.signal.aborted) setLoading(false)
        })
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [debounceMs, minSearchLength, pageSize, query])

  const accountById = new Map(accounts.map((account) => [account.id, account] as const))
  const options: GlobalAccountSelectOption[] = accounts.map((account) => ({
    value: account.id,
    label: `${account.name} · ${account.account}`,
    disabled: account.status !== 'active',
    account,
  }))
  const normalizedQueryLength = query.trim().length

  return (
    <Select<string | undefined, GlobalAccountSelectOption>
      {...selectProps}
      value={value}
      placeholder={placeholder ?? tr('搜索姓名或账号')}
      allowClear={allowClear}
      showSearch={{ onSearch: setQuery, filterOption: false }}
      loading={loading}
      options={options}
      onChange={
        /** 回传稳定 userId 和本次选项快照，并保留选中账号用于后续回显。 */ (
          userId,
          selectedOption,
        ) => {
          const option = Array.isArray(selectedOption) ? selectedOption[0] : selectedOption
          const account = userId ? (option?.account ?? accountById.get(userId)) : undefined
          setQuery('')
          setCurrentAccount(account)
          onChange?.(userId, account)
        }
      }
      labelRender={
        /** 搜索结果清空后仍使用账号快照渲染选中值，避免退化为裸 userId。 */ ({
          label,
          value: selectedUserId,
        }) => {
          const account =
            selectedAccount?.id === selectedUserId
              ? selectedAccount
              : currentAccount?.id === selectedUserId
                ? currentAccount
                : undefined
          return account
            ? `${account.name} · ${account.account}`
            : (label ?? String(selectedUserId))
        }
      }
      optionRender={
        /** 在候选项中同时展示姓名、完整账号和账号状态。 */ (option) => {
          const account = option.data.account
          const statusText =
            account.status === 'active'
              ? tr('启用')
              : account.status === 'locked'
                ? tr('锁定')
                : tr('停用')
          return (
            <Flex align="center" justify="space-between" gap={12}>
              <Flex vertical style={{ minWidth: 0 }}>
                <Typography.Text ellipsis>{account.name}</Typography.Text>
                <Typography.Text type="secondary" ellipsis>
                  {account.account}
                </Typography.Text>
              </Flex>
              <Tag color={account.status === 'active' ? 'success' : 'error'}>{statusText}</Tag>
            </Flex>
          )
        }
      }
      notFoundContent={
        loading ? (
          <Spin size="small" />
        ) : error ? (
          <Typography.Text type="danger">{tr('请求失败，请稍后重试')}</Typography.Text>
        ) : normalizedQueryLength < minSearchLength ? (
          <Typography.Text type="secondary">{tr('搜索姓名或账号')}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">
            {tr('暂无{type}', { type: tr('全局账号') })}
          </Typography.Text>
        )
      }
    />
  )
}
