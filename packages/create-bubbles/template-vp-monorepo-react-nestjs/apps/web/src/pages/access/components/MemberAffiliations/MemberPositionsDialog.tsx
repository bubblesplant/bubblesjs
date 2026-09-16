import { Alert, Modal, Select } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  MemberRecord,
  OrganizationMemberCandidate,
  OrganizationScope,
  PositionRecord,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import { canAddPositionAssignment } from '@/utils/organization-assignment'

export interface MemberPositionsDialogRef {
  show: (
    member: MemberRecord,
    candidate: OrganizationMemberCandidate,
    positions: PositionRecord[],
  ) => void
  hide: () => void
}

/** 只读取候选人在当前 URL 作用域身份中的岗位，避免聚合候选串入其他项目。 */
function currentPositionIds(candidate: OrganizationMemberCandidate, scope: OrganizationScope) {
  const scopeKey = accessScopeKey(scope)
  return [
    ...new Set(
      candidate.identities
        .filter((identity) => accessScopeKey(identity.scope) === scopeKey)
        .flatMap((identity) => identity.positions.map((item) => item.id)),
    ),
  ]
}

/** 按成员完整替换岗位任职，岗位与组织、角色保持独立。 */
export default function MemberPositionsDialog({
  ref,
  scope,
  onSave,
}: {
  ref: Ref<MemberPositionsDialogRef>
  scope: OrganizationScope
  onSave: (member: MemberRecord, positionIds: string[]) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [member, setMember] = useState<MemberRecord>()
  const [candidate, setCandidate] = useState<OrganizationMemberCandidate>()
  const [positions, setPositions] = useState<PositionRecord[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { tr } = useI18n()
  const hide = () => {
    if (!saving) setOpen(false)
  }
  useImperativeHandle(ref, () => ({
    /** 带入成员当前岗位和可见岗位列表后打开编辑器。 */
    show: (record, candidate, availablePositions) => {
      setMember(record)
      setCandidate(candidate)
      setPositions(availablePositions)
      setSelectedIds(currentPositionIds(candidate, scope))
      setOpen(true)
    },
    hide,
  }))

  return (
    <Modal
      title={tr('编辑岗位任职 · {name}', { name: member?.name ?? '' })}
      open={open}
      width={640}
      destroyOnHidden
      confirmLoading={saving}
      onCancel={hide}
      onOk={
        /** 提交成员在当前作用域的完整岗位 id 集合。 */ async () => {
          if (!member) return
          setSaving(true)
          try {
            const ok = await onSave(member, selectedIds)
            if (ok) setOpen(false)
          } finally {
            setSaving(false)
          }
        }
      }
    >
      <Alert
        type="info"
        showIcon
        title={tr('一名成员可以任多个岗位')}
        description={tr('保存只替换岗位任职，不会修改组织归属或角色。')}
        style={{ marginBottom: 16 }}
      />
      <Select
        mode="multiple"
        value={selectedIds}
        style={{ width: '100%' }}
        placeholder={tr('选择岗位')}
        showSearch
        optionFilterProp="label"
        options={positions.map((position) => ({
          value: position.id,
          label: `${position.name} · ${position.code}`,
          disabled:
            !selectedIds.includes(position.id) &&
            (!candidate ||
              !canAddPositionAssignment({
                candidate,
                scope,
                positionActive: position.status === 'active',
              })),
        }))}
        onChange={setSelectedIds}
      />
    </Modal>
  )
}
