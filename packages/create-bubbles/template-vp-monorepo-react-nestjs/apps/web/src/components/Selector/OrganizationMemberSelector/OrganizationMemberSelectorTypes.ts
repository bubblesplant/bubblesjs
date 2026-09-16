import type { SelectProps } from 'antd'
import type {
  OrganizationMemberCandidate,
  OrganizationMemberCandidateQuery,
  OrganizationScope,
} from 'shared/types'

/** 组织成员浏览器中可选筛选项。 */
export interface OrganizationMemberFilterOption {
  value: string
  label: string
}

/** 选择器当前 URL 作用域的展示信息；它不进入最终选择值。 */
export interface OrganizationMemberBrowserScope {
  type: OrganizationScope['type']
  label?: string
}

/** 业务侧提供给候选搜索请求的参数。 */
export interface OrganizationMemberSearchRequest extends Omit<
  OrganizationMemberCandidateQuery,
  'page' | 'pageSize' | 'query'
> {
  page: number
  pageSize: number
  query?: string
  signal?: AbortSignal
}

/** 组织成员搜索的分页结果。 */
export interface OrganizationMemberSearchResult {
  items: OrganizationMemberCandidate[]
  total: number
}

/** 某个企业或项目身份域内可用的组织、岗位和角色筛选数据。 */
export interface OrganizationMemberResourceFilters {
  organizationUnits?: readonly OrganizationMemberFilterOption[]
  positions?: readonly OrganizationMemberFilterOption[]
  roles?: readonly OrganizationMemberFilterOption[]
  allowUnassigned?: boolean
}

/** 组织成员浏览器可选的分类筛选数据。 */
export interface OrganizationMemberBrowserFilters extends OrganizationMemberResourceFilters {
  projects?: readonly OrganizationMemberFilterOption[]
  /** 企业浏览切到项目身份域时，按实际项目权限加载可见筛选项。 */
  loadProjectFilters?: (projectIds: string[]) => Promise<OrganizationMemberResourceFilters>
}

/** 组织成员弹窗浏览器公开方法。 */
export interface OrganizationMemberBrowserRef {
  show: (value: readonly string[], selectedRows?: readonly OrganizationMemberCandidate[]) => void
  hide: () => void
}

/** 组织成员弹窗浏览器属性。 */
export interface OrganizationMemberBrowserProps {
  ref: Ref<OrganizationMemberBrowserRef>
  /** 隔离不同作用域、解析来源和用途的候选缓存。 */
  candidateContextKey: string
  scope: OrganizationMemberBrowserScope
  multiple?: boolean
  title?: ReactNode
  filters?: OrganizationMemberBrowserFilters
  request: (input: OrganizationMemberSearchRequest) => Promise<OrganizationMemberSearchResult>
  resolve: (userIds: string[]) => Promise<OrganizationMemberCandidate[]>
  /** 业务场景附加禁选条件；已选项仍可从选择摘要中移除。 */
  getCandidateDisabled?: (candidate: OrganizationMemberCandidate) => boolean
  onConfirm: (userIds: string[], rows: OrganizationMemberCandidate[]) => void
}

type ManagedSelectProps =
  | 'value'
  | 'defaultValue'
  | 'mode'
  | 'options'
  | 'open'
  | 'showSearch'
  | 'onChange'
  | 'labelInValue'

/** Select 风格的组织成员选择器属性，稳定值始终为 userId。 */
export interface OrganizationMemberSelectorProps extends Omit<
  SelectProps<string | string[] | undefined>,
  ManagedSelectProps
> {
  value?: string | string[]
  /** 必须包含完整来源作用域和业务用途，防止同 userId 跨上下文复用。 */
  candidateContextKey: string
  scope: OrganizationMemberBrowserScope
  multiple?: boolean
  selectedCandidates?: readonly OrganizationMemberCandidate[]
  filters?: OrganizationMemberBrowserFilters
  request: OrganizationMemberBrowserProps['request']
  resolve: OrganizationMemberBrowserProps['resolve']
  getCandidateDisabled?: OrganizationMemberBrowserProps['getCandidateDisabled']
  onChange?: (
    value: string | string[] | undefined,
    candidates: OrganizationMemberCandidate[],
  ) => void
}
