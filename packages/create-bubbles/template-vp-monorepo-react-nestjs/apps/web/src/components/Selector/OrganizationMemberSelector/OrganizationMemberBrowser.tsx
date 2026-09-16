import { useI18n } from '@bubblesjs/i18n-react'
import type { OrganizationMemberCandidate } from 'shared/types'
import BasicTableSelector, { type BasicTableSelectorRef } from '../BasicTableSelector'
import { useOrganizationMemberCandidateColumns } from './OrganizationMemberCandidateColumns'
import OrganizationMemberFilterPanel, {
  createEmptyOrganizationMemberFilterValue,
} from './OrganizationMemberFilterPanel'
import type {
  OrganizationMemberBrowserProps,
  OrganizationMemberResourceFilters,
} from './OrganizationMemberSelectorTypes'

/** 提供左侧组织浏览、右侧分页选人、跨页选择和 resolve 回显。 */
export default function OrganizationMemberBrowser({
  ref,
  candidateContextKey,
  scope,
  multiple = false,
  title,
  filters,
  request,
  resolve,
  getCandidateDisabled,
  onConfirm,
}: OrganizationMemberBrowserProps) {
  const { tr } = useI18n()
  const columns = useOrganizationMemberCandidateColumns()
  const selectorRef = useRef<BasicTableSelectorRef<OrganizationMemberCandidate>>(null)
  const projectFilterRequestId = useRef(0)
  const [filterValue, setFilterValue] = useState(createEmptyOrganizationMemberFilterValue)
  const [projectResourceFilters, setProjectResourceFilters] =
    useState<OrganizationMemberResourceFilters>()
  const [projectFiltersLoading, setProjectFiltersLoading] = useState(false)
  const loadProjectFilters = filters?.loadProjectFilters

  const currentResourceFilters = useMemo<OrganizationMemberResourceFilters | undefined>(() => {
    if (!filters) return undefined
    return {
      organizationUnits: filters.organizationUnits,
      positions: filters.positions,
      roles: filters.roles,
      allowUnassigned: filters.allowUnassigned,
    }
  }, [filters])
  const projectIdsKey = filterValue.projectIds.join('\u0000')

  /** 企业范围切到项目身份域时，按实际可见权限异步加载该域筛选项。 */
  useEffect(() => {
    const requestId = ++projectFilterRequestId.current
    if (!filterValue.projectIds.length) {
      setProjectResourceFilters(undefined)
      setProjectFiltersLoading(false)
      return
    }
    if (!loadProjectFilters) {
      setProjectResourceFilters({})
      setProjectFiltersLoading(false)
      return
    }
    setProjectResourceFilters(undefined)
    setProjectFiltersLoading(true)
    void loadProjectFilters(filterValue.projectIds)
      .then((nextFilters) => {
        if (projectFilterRequestId.current === requestId) setProjectResourceFilters(nextFilters)
      })
      .catch(() => {
        if (projectFilterRequestId.current === requestId) setProjectResourceFilters({})
      })
      .finally(() => {
        if (projectFilterRequestId.current === requestId) setProjectFiltersLoading(false)
      })
  }, [candidateContextKey, loadProjectFilters, projectIdsKey, scope.type])

  useImperativeHandle(ref, () => ({
    /** 使用既有 userId 和候选快照打开隔离会话，并重置上次浏览筛选。 */
    show: (value, selectedRows) => {
      projectFilterRequestId.current += 1
      setFilterValue(createEmptyOrganizationMemberFilterValue())
      setProjectResourceFilters(undefined)
      setProjectFiltersLoading(false)
      selectorRef.current?.show({ value, selectedRows })
    },
    /** 关闭当前选择会话并丢弃尚未确认的改动。 */
    hide: () => {
      projectFilterRequestId.current += 1
      selectorRef.current?.hide()
    },
  }))

  const resourceFilters = filterValue.projectIds.length
    ? projectResourceFilters
    : currentResourceFilters

  return (
    <BasicTableSelector<OrganizationMemberCandidate>
      ref={selectorRef}
      title={title ?? tr('选择成员')}
      rowKey="userId"
      multiple={multiple}
      columns={columns}
      params={filterValue}
      sidePanel={
        <OrganizationMemberFilterPanel
          scope={scope}
          projects={scope.type === 'company' ? filters?.projects : undefined}
          resourceFilters={resourceFilters}
          loading={projectFiltersLoading}
          value={filterValue}
          onChange={setFilterValue}
        />
      }
      request={
        /** 合并搜索、左侧身份域与资源筛选，并保持服务端分页结果。 */ async (params) => {
          const result = await request({
            page: params.current ?? 1,
            pageSize: params.pageSize ?? 20,
            query: params.query as string | undefined,
            organizationUnitIds: filterValue.organizationUnitIds.length
              ? filterValue.organizationUnitIds
              : undefined,
            positionIds: filterValue.positionIds.length ? filterValue.positionIds : undefined,
            roleIds: filterValue.roleIds.length ? filterValue.roleIds : undefined,
            projectIds: filterValue.projectIds.length ? filterValue.projectIds : undefined,
            unassigned: filterValue.unassigned || undefined,
          })
          return { data: result.items, total: result.total, success: true }
        }
      }
      requestByKeys={
        /** 按稳定 userId 批量补查跨页或历史选择。 */ async (keys) => resolve(keys.map(String))
      }
      labelRender={(candidate) => `${candidate.name} · ${candidate.account}`}
      getCheckboxProps={(candidate) => {
        const disabled = candidate.disabled || getCandidateDisabled?.(candidate)
        return {
          disabled,
          title: disabled ? tr('该成员当前不可新增，既有选择仍可移除') : undefined,
        }
      }}
      onChange={(keys, rows) => onConfirm(keys.map(String), rows)}
      pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
      scroll={{ y: 400 }}
      modalProps={{ width: 1380 }}
    />
  )
}
