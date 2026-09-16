import type { SelectProps } from 'antd'
import type { AccountRecord } from 'shared/types'

/** 全局账号下拉框展示和回填所需的最小账号资料。 */
export type GlobalAccountOption = Pick<AccountRecord, 'id' | 'account' | 'name' | 'status'>

/** 传给 Ant Design Select 的账号选项，保留完整账号快照供渲染和回调使用。 */
export interface GlobalAccountSelectOption {
  value: string
  label: string
  disabled: boolean
  account: GlobalAccountOption
}

/** 业务侧查询全局账号候选项时接收的标准参数。 */
export interface GlobalAccountSearchRequest {
  /** 已去除首尾空白的姓名或账号关键词。 */
  query: string
  /** 当前组件只查询第一页，字段保留用于对接分页接口。 */
  page: number
  /** 单次最多返回的候选账号数。 */
  pageSize: number
  /** 新搜索或组件卸载时会中止旧请求。 */
  signal: AbortSignal
}

/** 业务查询返回的全局账号候选结果。 */
export interface GlobalAccountSearchResult {
  items: readonly GlobalAccountOption[]
  total?: number
}

type ManagedSelectProps =
  | 'value'
  | 'defaultValue'
  | 'options'
  | 'mode'
  | 'showSearch'
  | 'filterOption'
  | 'labelInValue'
  | 'loading'
  | 'onSearch'
  | 'onChange'
  | 'optionRender'
  | 'labelRender'
  | 'notFoundContent'

/** 受控全局账号 Select 的公开属性。默认值应由 Form 的 initialValues 提供。 */
export interface GlobalAccountSelectProps extends Omit<
  SelectProps<string | undefined, GlobalAccountSelectOption>,
  ManagedSelectProps
> {
  /** 始终使用全局用户 id 作为表单值。 */
  value?: string
  /** 编辑回显时提供已选账号，避免组件只能显示裸 userId。 */
  selectedAccount?: GlobalAccountOption
  /** 由业务侧注入受权限保护的候选账号查询。 */
  request: (input: GlobalAccountSearchRequest) => Promise<GlobalAccountSearchResult>
  /** 触发远程查询所需的最少字符数，默认 2。 */
  minSearchLength?: number
  /** 输入停止后发起查询的等待时间，单位毫秒，默认 300。 */
  debounceMs?: number
  /** 单次查询的最大候选数量，默认 20。 */
  pageSize?: number
  /** 返回稳定 userId，并同时提供当前账号快照便于业务展示或过渡映射。 */
  onChange?: (userId: string | undefined, account: GlobalAccountOption | undefined) => void
}
