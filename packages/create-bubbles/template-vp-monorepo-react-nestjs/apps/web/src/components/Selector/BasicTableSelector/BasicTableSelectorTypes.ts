import type { ParamsType, ProTableProps } from '@ant-design/pro-components'
import type { ModalProps } from 'antd'

export type BasicTableSelectorRowKey<T> = (keyof T & string) | ((record: T) => Key)

export interface BasicTableSelectorShowOptions<T> {
  /** 单选也传数组；省略表示从空选择开始。 */
  value?: readonly Key[]
  /** 为已有 key 提供对象，避免依赖当前页数据。组件不会修改这些对象。 */
  selectedRows?: readonly T[]
}

export interface BasicTableSelectorRef<T> {
  /** 打开一个隔离的选择会话，并可传入已有选中值和对象。 */
  show: (options?: BasicTableSelectorShowOptions<T>) => void
  /** 关闭当前选择会话，不提交本轮临时修改。 */
  hide: () => void
}

type ManagedTableProps =
  | 'ref'
  | 'title'
  | 'rowKey'
  | 'rowSelection'
  | 'request'
  | 'dataSource'
  | 'defaultData'
  | 'editable'
  | 'onChange'
  | 'tableAlertRender'
  | 'tableAlertOptionRender'

export type BasicTableSelectorProps<
  T extends object,
  Params extends ParamsType = ParamsType,
  ValueType = 'text',
> = Omit<ProTableProps<T, Params, ValueType>, ManagedTableProps> & {
  ref: Ref<BasicTableSelectorRef<T>>
  title: ReactNode
  rowKey: BasicTableSelectorRowKey<T>
  request: NonNullable<ProTableProps<T, Params, ValueType>['request']>
  multiple?: boolean
  /** 仅点击确定时触发；keys 和 rows 长度、顺序始终一致。 */
  onChange: (keys: Key[], rows: T[]) => void | Promise<void>
  /** 确定时补查尚未取得对象的已选 key；返回顺序不限。 */
  requestByKeys?: (keys: Key[]) => Promise<T[]>
  labelRender?: (record: T) => ReactNode
  /** 可选左侧浏览面板；选择摘要、错误和分页表格仍统一保留在右侧。 */
  sidePanel?: ReactNode
  /** 保留 ProTable 的分页、排序、筛选回调，避免与选择结果 onChange 重名。 */
  onTableChange?: ProTableProps<T, Params, ValueType>['onChange']
  getCheckboxProps?: Exclude<
    ProTableProps<T, Params, ValueType>['rowSelection'],
    false | undefined
  >['getCheckboxProps']
  modalProps?: Pick<
    ModalProps,
    'width' | 'centered' | 'okText' | 'cancelText' | 'className' | 'styles' | 'zIndex'
  >
}
