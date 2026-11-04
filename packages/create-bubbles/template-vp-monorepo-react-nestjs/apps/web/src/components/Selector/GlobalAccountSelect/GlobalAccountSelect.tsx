import { useI18n } from '@bubblesjs/i18n-react'
import { Select } from 'antd'
import type { BasicTableSelectorRef } from '../BasicTableSelector'
import GlobalAccountBrowser from './GlobalAccountBrowser'
import type {
  GlobalAccountOption,
  GlobalAccountSelectOption,
  GlobalAccountSelectProps,
} from './GlobalAccountSelectTypes'

/** 以 userId 数组保存账号，单选或跨页多选都在确认后回填表单。 */
export default function GlobalAccountSelect({
  value = [],
  multiple = false,
  selectedAccount,
  selectedAccounts,
  request,
  resolve,
  minSearchLength,
  debounceMs,
  pageSize,
  placeholder,
  disabled,
  allowClear = true,
  onChange,
  ...selectProps
}: GlobalAccountSelectProps) {
  const { tr } = useI18n()
  const browserRef = useRef<BasicTableSelectorRef<GlobalAccountOption>>(null)
  const [resolvedAccounts, setResolvedAccounts] = useState<readonly GlobalAccountOption[]>([])
  const [resolving, setResolving] = useState(false)
  const resolveRef = useRef(resolve)
  const accountCacheRef = useRef(new Map<string, GlobalAccountOption>())
  const resolveSequence = useRef(0)
  const uniqueIds = [...new Set(value)]
  const ids = multiple ? uniqueIds : uniqueIds.slice(0, 1)
  const idsKey = JSON.stringify(ids)
  resolveRef.current = resolve

  /** 批量补查缺失快照；切换值、清空或卸载时取消旧请求，失败保留 ID。 */
  useEffect(() => {
    const sequence = ++resolveSequence.current
    const controller = new AbortController()
    const cache = accountCacheRef.current
    for (const account of selectedAccounts ?? []) cache.set(account.userId, account)
    if (selectedAccount) cache.set(selectedAccount.userId, selectedAccount)
    const currentIds: string[] = JSON.parse(idsKey)
    const missing = currentIds.filter((id) => !cache.has(id))
    setResolvedAccounts([...cache.values()])
    setResolving(missing.length > 0)
    if (missing.length) {
      void resolveRef
        .current(missing, controller.signal)
        .then((accounts) => {
          if (resolveSequence.current !== sequence || controller.signal.aborted) return
          for (const account of accounts) cache.set(account.userId, account)
          setResolvedAccounts([...cache.values()])
        })
        .catch(() => {
          // 不伪造候选或循环重试，仍可打开弹窗重新选择。
        })
        .finally(() => {
          if (resolveSequence.current === sequence && !controller.signal.aborted)
            setResolving(false)
        })
    }
    return () => controller.abort()
  }, [idsKey, selectedAccount, selectedAccounts])

  const accountById = new Map(resolvedAccounts.map((account) => [account.userId, account]))
  for (const account of selectedAccounts ?? []) accountById.set(account.userId, account)
  if (selectedAccount) accountById.set(selectedAccount.userId, selectedAccount)
  const accounts = ids
    .map((id) => accountById.get(id))
    .filter((account): account is GlobalAccountOption => !!account)
  const options: GlobalAccountSelectOption[] = accounts.map((account) => ({
    value: account.userId,
    label: `${account.name} · ${account.account}`,
    disabled: false,
    account,
  }))

  /** 使用当前值和可信快照打开弹窗，不在打开时修改表单。 */
  const show = () => {
    if (!disabled) browserRef.current?.show({ value: ids, selectedRows: accounts })
  }

  /** 缓存确认结果，单选仍输出一个元素的数组，空选择输出 []。 */
  const confirm = (rows: GlobalAccountOption[]) => {
    if (disabled) return
    const next = [...new Map(rows.map((account) => [account.userId, account])).values()]
    const selected = multiple ? next : next.slice(0, 1)
    for (const account of selected) accountCacheRef.current.set(account.userId, account)
    setResolvedAccounts([...accountCacheRef.current.values()])
    onChange?.(
      selected.map((account) => account.userId),
      selected,
    )
  }

  return (
    <>
      <Select<string | string[], GlobalAccountSelectOption>
        {...selectProps}
        style={{ width: '100%', ...selectProps.style }}
        maxTagCount={selectProps.maxTagCount ?? 'responsive'}
        value={multiple ? ids : ids[0]}
        mode={multiple ? 'multiple' : undefined}
        placeholder={placeholder ?? tr('搜索姓名或账号')}
        disabled={disabled}
        allowClear={allowClear}
        open={false}
        showSearch={false}
        loading={resolving}
        options={options}
        onOpenChange={(open) => {
          if (open) show()
        }}
        onChange={(nextValue) => {
          if (disabled) return
          const next = [
            ...new Set(Array.isArray(nextValue) ? nextValue : nextValue ? [nextValue] : []),
          ]
          const nextIds = multiple ? next : next.slice(0, 1)
          onChange?.(
            nextIds,
            nextIds
              .map((id) => accountById.get(id))
              .filter((account): account is GlobalAccountOption => !!account),
          )
        }}
        labelRender={({ value: id }) => {
          const account = accountById.get(String(id))
          return account ? `${account.name} · ${account.account}` : tr('账号信息不可用')
        }}
      />
      <GlobalAccountBrowser
        ref={browserRef}
        multiple={multiple}
        request={request}
        resolve={resolve}
        minSearchLength={minSearchLength}
        debounceMs={debounceMs}
        pageSize={pageSize}
        onConfirm={confirm}
      />
    </>
  )
}
