import type { SelectProps } from 'antd'
import type { GlobalAccountCandidate } from 'shared/types'

/** 全局账号选择器直接消费服务端按 purpose 裁剪后的候选记录。 */
export type GlobalAccountOption = GlobalAccountCandidate

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
  /** 账号选择弹窗当前查询的页码。 */
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

/** 业务侧按稳定 userId 补查账号快照的函数，并接收组件生命周期内的取消信号。 */
export type GlobalAccountResolver = (
  userIds: readonly string[],
  signal: AbortSignal,
) => Promise<readonly GlobalAccountOption[]>

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
  | 'open'
  | 'onOpenChange'

/** 受控全局账号选择字段，点击打开分页弹窗。默认值由 Form.initialValues 提供。 */
export interface GlobalAccountSelectProps extends Omit<
  SelectProps<string | string[], GlobalAccountSelectOption>,
  ManagedSelectProps
> {
  /** 全局用户 ID 数组；单选最多一项，清空为 []。 */
  value?: string[]
  /** 默认单选；启用后支持跨页多选。 */
  multiple?: boolean
  /** 编辑回显的账号快照，支持单选与多选。 */
  selectedAccounts?: readonly GlobalAccountOption[]
  /** 编辑回显时提供已选账号，避免组件只能显示裸 userId。 */
  selectedAccount?: GlobalAccountOption
  /** 由业务侧注入受权限保护的候选账号查询。 */
  request: (input: GlobalAccountSearchRequest) => Promise<GlobalAccountSearchResult>
  /** 由业务侧注入与搜索 purpose 相同的 userId 补查请求。 */
  resolve: GlobalAccountResolver
  /** 搜索所需的最少字符数，默认 0，允许打开弹窗后直接分页浏览。 */
  minSearchLength?: number
  /** 弹窗查询的防抖等待时间，单位毫秒，默认 300。 */
  debounceMs?: number
  /** 弹窗默认每页候选数量，默认 20。 */
  pageSize?: number
  /** 返回稳定 userId 数组与按选择顺序排列的账号快照。 */
  onChange?: (userIds: string[], accounts: GlobalAccountOption[]) => void
}
