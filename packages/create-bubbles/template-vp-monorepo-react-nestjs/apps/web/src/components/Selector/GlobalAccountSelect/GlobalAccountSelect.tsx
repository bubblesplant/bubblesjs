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
  resolve,
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
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState(false)
  const requestRef = useRef(request)
  const resolveRef = useRef(resolve)
  const accountCacheRef = useRef(new Map<string, GlobalAccountOption>())
  const requestSequence = useRef(0)
  const resolveSequence = useRef(0)
  const attemptedResolveValueRef = useRef<string | undefined>(undefined)
  requestRef.current = request
  resolveRef.current = resolve

  /** 优先使用业务快照或当前搜索结果，并按需通过 userId 补齐账号回显。 */
  useEffect(() => {
    if (!value) {
      attemptedResolveValueRef.current = undefined
      setCurrentAccount(undefined)
      setResolving(false)
      return
    }

    const knownAccount =
      (selectedAccount?.userId === value ? selectedAccount : undefined) ??
      accountCacheRef.current.get(value)
    if (knownAccount) {
      accountCacheRef.current.set(knownAccount.userId, knownAccount)
      attemptedResolveValueRef.current = undefined
      setCurrentAccount(knownAccount)
      setResolving(false)
      return
    }

    if (attemptedResolveValueRef.current === value) return
    attemptedResolveValueRef.current = value
    const sequence = ++resolveSequence.current
    const controller = new AbortController()
    setCurrentAccount(undefined)
    setResolving(true)
    void resolveRef
      .current([value], controller.signal)
      .then((resolvedAccounts) => {
        if (resolveSequence.current !== sequence || controller.signal.aborted) return
        for (const account of resolvedAccounts) accountCacheRef.current.set(account.userId, account)
        setCurrentAccount(accountCacheRef.current.get(value))
      })
      .catch(() => {
        // 补查失败时保留受控 userId，但不伪造候选；同一值等待显式变化后再重试。
      })
      .finally(() => {
        if (resolveSequence.current === sequence && !controller.signal.aborted) setResolving(false)
      })

    return () => controller.abort()
  }, [selectedAccount, value])

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
            result.items.map((account) => [account.userId, account] as const),
          )
          for (const account of uniqueAccounts.values())
            accountCacheRef.current.set(account.userId, account)
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

  const accountById = new Map(accounts.map((account) => [account.userId, account] as const))
  const options: GlobalAccountSelectOption[] = accounts.map((account) => ({
    value: account.userId,
    label: `${account.name} · ${account.account}`,
    disabled: account.disabled,
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
      loading={loading || resolving}
      options={options}
      onChange={
        /** 回传稳定 userId 和本次选项快照，并保留选中账号用于后续回显。 */ (
          userId,
          selectedOption,
        ) => {
          const option = Array.isArray(selectedOption) ? selectedOption[0] : selectedOption
          const account = userId ? (option?.account ?? accountById.get(userId)) : undefined
          if (account) accountCacheRef.current.set(account.userId, account)
          setQuery('')
          setCurrentAccount(account)
          onChange?.(userId, account)
        }
      }
      labelRender={
        /** 使用可信账号快照渲染选中值；缺失时给出不可用提示而不暴露裸 userId。 */ ({
          value: selectedUserId,
        }) => {
          const account =
            selectedAccount?.userId === selectedUserId
              ? selectedAccount
              : currentAccount?.userId === selectedUserId
                ? currentAccount
                : typeof selectedUserId === 'string'
                  ? accountCacheRef.current.get(selectedUserId)
                  : undefined
          return account ? `${account.name} · ${account.account}` : tr('账号信息不可用')
        }
      }
      optionRender={
        /** 在候选项中同时展示姓名、完整账号和账号状态。 */ (option) => {
          const account = option.data.account
          const statusText = account.status === 'active' ? tr('启用') : tr('不可选')
          return (
            <Flex align="center" justify="space-between" gap={12}>
              <Flex vertical style={{ minWidth: 0 }}>
                <Typography.Text ellipsis>{account.name}</Typography.Text>
                <Typography.Text type="secondary" ellipsis>
                  {account.account}
                </Typography.Text>
              </Flex>
              <Tag color={account.disabled ? 'error' : 'success'}>{statusText}</Tag>
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
