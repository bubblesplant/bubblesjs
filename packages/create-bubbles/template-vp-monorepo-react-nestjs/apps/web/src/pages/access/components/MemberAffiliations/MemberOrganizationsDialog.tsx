import { Alert, Modal, Select, Space, Table, Typography } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  MemberRecord,
  OrganizationDuty,
  OrganizationMemberCandidate,
  OrganizationRelationInput,
  OrganizationScope,
  OrganizationUnitNode,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import {
  canAddOrganizationAssignment,
  canChangeOrganizationDuty,
} from '@/utils/organization-assignment'

export interface MemberOrganizationsDialogRef {
  show: (
    member: MemberRecord,
    candidate: OrganizationMemberCandidate,
    units: OrganizationUnitNode[],
  ) => void
  hide: () => void
}

/** 只读取成员在当前 URL 作用域身份中的组织关系，避免聚合候选串入其他项目。 */
function currentRelations(candidate: OrganizationMemberCandidate, scope: OrganizationScope) {
  const scopeKey = accessScopeKey(scope)
  return candidate.identities
    .filter((identity) => accessScopeKey(identity.scope) === scopeKey)
    .flatMap((identity) => identity.organizationUnits)
}

/** 按成员完整替换组织归属及职责，不构造主归属。 */
export default function MemberOrganizationsDialog({
  ref,
  scope,
  onSave,
}: {
  ref: Ref<MemberOrganizationsDialogRef>
  scope: OrganizationScope
  onSave: (member: MemberRecord, relations: OrganizationRelationInput[]) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [member, setMember] = useState<MemberRecord>()
  const [candidate, setCandidate] = useState<OrganizationMemberCandidate>()
  const [units, setUnits] = useState<OrganizationUnitNode[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [duties, setDuties] = useState<Record<string, OrganizationDuty>>({})
  const [initialDuties, setInitialDuties] = useState<Record<string, OrganizationDuty>>({})
  const { tr } = useI18n()
  const hide = () => {
    if (!saving) setOpen(false)
  }
  useImperativeHandle(ref, () => ({
    /** 带入成员当前全部组织关系和可见组织单元后打开编辑器。 */
    show: (record, candidate, availableUnits) => {
      const relations = currentRelations(candidate, scope)
      setMember(record)
      setCandidate(candidate)
      setUnits(availableUnits)
      setSelectedIds(relations.map((relation) => relation.id))
      const nextDuties = Object.fromEntries(
        relations.map((relation) => [relation.id, relation.duty]),
      )
      setDuties(nextDuties)
      setInitialDuties(nextDuties)
      setOpen(true)
    },
    hide,
  }))

  /** 更新单元职责；选中负责人时只在同一单元关系中更新当前成员职责。 */
  const changeDuty = (unitId: string, duty: OrganizationDuty) => {
    setDuties((current) => ({ ...current, [unitId]: duty }))
  }

  return (
    <Modal
      title={tr('编辑组织归属 · {name}', { name: member?.name ?? '' })}
      open={open}
      width={820}
      destroyOnHidden
      confirmLoading={saving}
      onCancel={hide}
      onOk={
        /** 提交成员在当前作用域的完整组织关系集合。 */ async () => {
          if (!member) return
          setSaving(true)
          try {
            const ok = await onSave(
              member,
              selectedIds.map((organizationUnitId) => ({
                organizationUnitId,
                duty: duties[organizationUnitId] ?? 'member',
              })),
            )
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
        title={tr('所有组织归属同等有效')}
        description={tr('成员可以加入多个组织单元，不存在主归属；保存不会改变岗位或角色。')}
        style={{ marginBottom: 16 }}
      />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Select
          mode="multiple"
          value={selectedIds}
          style={{ width: '100%' }}
          placeholder={tr('选择组织单元')}
          showSearch
          optionFilterProp="label"
          options={units.map((unit) => ({
            value: unit.id,
            label: unit.fullPath,
            disabled:
              !selectedIds.includes(unit.id) &&
              (!candidate ||
                !canAddOrganizationAssignment({
                  candidate,
                  scope,
                  unitEffective: unit.effective,
                })),
          }))}
          onChange={(ids) => {
            setSelectedIds(ids)
            setDuties((current) => ({
              ...Object.fromEntries(ids.map((id) => [id, 'member'])),
              ...Object.fromEntries(
                ids
                  .filter((id) => current[id] !== undefined)
                  .map((id) => [id, current[id]!] as const),
              ),
            }))
          }}
        />
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={units.filter((unit) => selectedIds.includes(unit.id))}
          scroll={{ y: 300 }}
          columns={[
            { title: tr('组织单元'), dataIndex: 'fullPath' },
            {
              title: tr('职责'),
              width: 180,
              render: (_, unit) => (
                <Select<OrganizationDuty>
                  value={duties[unit.id] ?? 'member'}
                  style={{ width: 150 }}
                  options={[
                    { value: 'member', label: tr('成员') },
                    { value: 'deputy', label: tr('副负责人') },
                    { value: 'leader', label: tr('负责人') },
                  ].map((option) => ({
                    ...option,
                    disabled:
                      !candidate ||
                      !canChangeOrganizationDuty({
                        candidate,
                        scope,
                        unitEffective: unit.effective,
                        initialDuty: initialDuties[unit.id],
                        nextDuty: option.value as OrganizationDuty,
                      }),
                  }))}
                  onChange={(duty) => changeDuty(unit.id, duty)}
                />
              ),
            },
          ]}
          locale={{
            emptyText: <Typography.Text type="secondary">{tr('暂未选择组织单元')}</Typography.Text>,
          }}
        />
      </Space>
    </Modal>
  )
}
