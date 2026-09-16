import { ModalForm, ProForm } from '@ant-design/pro-components'
import { Alert } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { OrganizationMemberCandidate, OrganizationScope, PositionRecord } from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import OrganizationMemberSelector from '@/components/Selector/OrganizationMemberSelector'
import type {
  OrganizationMemberBrowserFilters,
  OrganizationMemberSearchRequest,
  OrganizationMemberSearchResult,
} from '@/components/Selector/OrganizationMemberSelector'
import { canAddPositionAssignment } from '@/utils/organization-assignment'

export interface PositionMembersDialogRef {
  show: (
    record: PositionRecord,
    selected: OrganizationMemberCandidate[],
    filters: OrganizationMemberBrowserFilters,
  ) => void
  hide: () => void
}

/** 按岗位完整替换任职成员，选值始终是平台稳定 userId。 */
export default function PositionMembersDialog({
  ref,
  scope,
  request,
  resolve,
  onSave,
}: {
  ref: Ref<PositionMembersDialogRef>
  scope: OrganizationScope
  request: (input: OrganizationMemberSearchRequest) => Promise<OrganizationMemberSearchResult>
  resolve: (userIds: string[]) => Promise<OrganizationMemberCandidate[]>
  onSave: (record: PositionRecord, userIds: string[]) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState<PositionRecord>()
  const [selected, setSelected] = useState<OrganizationMemberCandidate[]>([])
  const [browserFilters, setBrowserFilters] = useState<OrganizationMemberBrowserFilters>({})
  const { tr } = useI18n()
  const hide = () => setOpen(false)
  useImperativeHandle(ref, () => ({
    /** 带入岗位当前完整成员集合并打开分配弹窗。 */
    show: (item, candidates, filters) => {
      setRecord(item)
      setSelected(candidates)
      setBrowserFilters(filters)
      setOpen(true)
    },
    hide,
  }))
  return (
    <ModalForm<{ userIds: string[] }>
      title={tr('分配岗位成员 · {name}', { name: record?.name ?? '' })}
      open={open}
      width={720}
      initialValues={{ userIds: selected.map((candidate) => candidate.userId) }}
      modalProps={{ destroyOnHidden: true, onCancel: hide }}
      onOpenChange={(visible) => {
        if (!visible) hide()
      }}
      submitter={{ searchConfig: { submitText: tr('保存任职成员') } }}
      onFinish={
        /** 提交该岗位完整 userId 集合，空数组表示清空岗位成员。 */ async (values) => {
          if (!record) return false
          const ok = await onSave(record, values.userIds ?? [])
          if (ok) hide()
          return ok
        }
      }
    >
      <Alert
        type="info"
        showIcon
        title={tr('岗位与组织归属相互独立')}
        description={tr('保存只会替换此岗位的任职成员，不会修改成员所在组织或角色。')}
        style={{ marginBottom: 20 }}
      />
      <ProForm.Item name="userIds" label={tr('任职成员')}>
        <OrganizationMemberSelector
          candidateContextKey={`${accessScopeKey(scope)}:assignPositionMembers`}
          scope={{ type: scope.type }}
          multiple
          selectedCandidates={selected}
          filters={browserFilters}
          request={request}
          resolve={resolve}
          getCandidateDisabled={(candidate) =>
            !record ||
            !canAddPositionAssignment({
              candidate,
              scope,
              positionActive: record.status === 'active',
            })
          }
          placeholder={tr('选择一个或多个成员')}
        />
      </ProForm.Item>
    </ModalForm>
  )
}
