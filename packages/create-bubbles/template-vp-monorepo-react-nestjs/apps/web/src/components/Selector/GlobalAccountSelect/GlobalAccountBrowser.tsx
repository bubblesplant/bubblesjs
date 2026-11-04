import type { ProColumns } from '@ant-design/pro-components'
import { Typography } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import BasicTableSelector, { type BasicTableSelectorRef } from '../BasicTableSelector'
import SelectedPersonLabel from '../SelectedPersonLabel'
import type { GlobalAccountOption, GlobalAccountSelectProps } from './GlobalAccountSelectTypes'

type GlobalAccountBrowserProps = Pick<
  GlobalAccountSelectProps,
  'request' | 'resolve' | 'minSearchLength' | 'debounceMs' | 'pageSize' | 'multiple'
> & {
  ref: Ref<BasicTableSelectorRef<GlobalAccountOption>>
  onConfirm: (accounts: GlobalAccountOption[]) => void
}

/** 复用表格选择器浏览全局账号，隔离临时选择并在关闭时取消候选请求。 */
export default function GlobalAccountBrowser({
  ref,
  multiple = false,
  request,
  resolve,
  minSearchLength = 0,
  debounceMs = 300,
  pageSize = 20,
  onConfirm,
}: GlobalAccountBrowserProps) {
  const { tr } = useI18n()
  const selectorRef = useRef<BasicTableSelectorRef<GlobalAccountOption>>(null)
  const searchController = useRef<AbortController | undefined>(undefined)
  const resolveController = useRef<AbortController | undefined>(undefined)

  /** 结束当前浏览请求，避免关闭或重新打开后旧结果影响当前会话。 */
  const cancelRequests = () => {
    searchController.current?.abort()
    resolveController.current?.abort()
  }

  useEffect(() => cancelRequests, [])
  useImperativeHandle(ref, () => ({
    /** 使用当前表单值和快照开启独立的账号选择会话。 */
    show: (options) => {
      cancelRequests()
      selectorRef.current?.show(options)
    },
    hide: () => selectorRef.current?.hide(),
  }))

  const columns: ProColumns<GlobalAccountOption>[] = [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('搜索姓名或账号') },
    },
    { title: tr('姓名'), dataIndex: 'name', search: false, fixed: 'left', width: 160 },
    { title: tr('完整账号'), dataIndex: 'account', search: false, copyable: true, width: 260 },
    {
      title: tr('状态'),
      search: false,
      width: 130,
      render: (_, account) =>
        account.disabled ? (
          <Typography.Text type="danger">{tr('不可选')}</Typography.Text>
        ) : (
          <Typography.Text type="success">{tr('可选择')}</Typography.Text>
        ),
    },
  ]

  return (
    <BasicTableSelector<GlobalAccountOption>
      ref={selectorRef}
      multiple={multiple}
      title={tr('全局账号')}
      description={tr('浏览账号并添加到已选列表')}
      selectionTitle={tr('已选账号')}
      emptyDescription={tr('从左侧选择账号')}
      rowKey="userId"
      columns={columns}
      debounceTime={debounceMs}
      request={
        /** 按实际页码搜索账号，并取消上一轮尚未完成的查询。 */ async (params) => {
          searchController.current?.abort()
          const controller = new AbortController()
          searchController.current = controller
          const query = typeof params.query === 'string' ? params.query.trim() : ''
          if (query.length < minSearchLength) return { data: [], total: 0, success: true }
          const result = await request({
            query,
            page: params.current ?? 1,
            pageSize: params.pageSize ?? pageSize,
            signal: controller.signal,
          })
          controller.signal.throwIfAborted()
          const accounts = new Map(result.items.map((account) => [account.userId, account]))
          return {
            data: [...accounts.values()],
            total: result.total ?? accounts.size,
            success: true,
          }
        }
      }
      requestByKeys={
        /** 确认时补齐尚未加载的已选账号，保持 userId 和快照对应。 */ async (keys) => {
          resolveController.current?.abort()
          const controller = new AbortController()
          resolveController.current = controller
          const accounts = await resolve(keys.map(String), controller.signal)
          controller.signal.throwIfAborted()
          return [...accounts]
        }
      }
      labelRender={(account) => (
        <SelectedPersonLabel name={account.name} account={account.account} />
      )}
      getCheckboxProps={(account) => ({ disabled: account.disabled })}
      onChange={
        /** 仅在确认后回填有效账号，取消时由通用选择器保留原表单值。 */ (_, rows) => {
          if (rows.some((account) => account.disabled)) throw new Error(tr('账号信息不可用'))
          onConfirm(rows)
        }
      }
      onClose={cancelRequests}
      pagination={{ defaultPageSize: pageSize, showSizeChanger: true }}
    />
  )
}
