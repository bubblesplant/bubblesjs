import { Alert, Modal, Select, Space, Table, Typography } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type {
  OrganizationDuty,
  OrganizationMemberCandidate,
  OrganizationScope,
  OrganizationUnitMemberInput,
  OrganizationUnitNode,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import OrganizationMemberSelector from '@/components/Selector/OrganizationMemberSelector'
import type {
  OrganizationMemberBrowserFilters,
  OrganizationMemberSearchRequest,
  OrganizationMemberSearchResult,
} from '@/components/Selector/OrganizationMemberSelector'
import {
  canAddOrganizationAssignment,
  canChangeOrganizationDuty,
} from '@/utils/organization-assignment'

export interface OrganizationMembersDialogRef {
  show: (
    unit: OrganizationUnitNode,
    selected: OrganizationMemberCandidate[],
    filters: OrganizationMemberBrowserFilters,
  ) => void
  hide: () => void
}

/** 从候选在当前完整作用域的身份中读取指定组织单元职责。 */
function currentDuty(
  candidate: OrganizationMemberCandidate,
  scope: OrganizationScope,
  unitId: string,
): OrganizationDuty {
  const scopeKey = accessScopeKey(scope)
  const identity = candidate.identities.find((item) => accessScopeKey(item.scope) === scopeKey)
  const relation = identity?.organizationUnits.find((item) => item.id === unitId)
  if (relation) return relation.duty
  return 'member'
}

/** 按组织单元完整替换成员集合，并为每名成员维护唯一职责。 */
export default function OrganizationMembersDialog({
  ref,
  scope,
  request,
  resolve,
  onSave,
}: {
  ref: Ref<OrganizationMembersDialogRef>
  scope: OrganizationScope
  request: (input: OrganizationMemberSearchRequest) => Promise<OrganizationMemberSearchResult>
  resolve: (userIds: string[]) => Promise<OrganizationMemberCandidate[]>
  onSave: (unit: OrganizationUnitNode, members: OrganizationUnitMemberInput[]) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [unit, setUnit] = useState<OrganizationUnitNode>()
  const [selected, setSelected] = useState<OrganizationMemberCandidate[]>([])
  const [browserFilters, setBrowserFilters] = useState<OrganizationMemberBrowserFilters>({})
  const [duties, setDuties] = useState<Record<string, OrganizationDuty>>({})
  const [initialDuties, setInitialDuties] = useState<Record<string, OrganizationDuty>>({})
  const [saving, setSaving] = useState(false)
  const { tr } = useI18n()
  const hide = () => {
    if (!saving) setOpen(false)
  }
  useImperativeHandle(ref, () => ({
    /** 使用该组织单元当前完整成员集合打开编辑会话。 */
    show: (record, candidates, filters) => {
      setUnit(record)
      setSelected(candidates)
      setBrowserFilters(filters)
      const nextDuties = Object.fromEntries(
        candidates.map((candidate) => [candidate.userId, currentDuty(candidate, scope, record.id)]),
      )
      setDuties(nextDuties)
      setInitialDuties(nextDuties)
      setOpen(true)
    },
    hide,
  }))

  /** 更新成员职责；选择负责人时自动保证界面中至多一名负责人。 */
  const changeDuty = (userId: string, duty: OrganizationDuty) => {
    setDuties((current) => {
      const next = { ...current, [userId]: duty }
      if (duty === 'leader') {
        for (const key of Object.keys(next))
          if (key !== userId && next[key] === 'leader') next[key] = 'member'
      }
      return next
    })
  }

  return (
    <Modal
      title={tr('组织成员 · {name}', { name: unit?.name ?? '' })}
      open={open}
      width={920}
      destroyOnHidden
      confirmLoading={saving}
      onCancel={hide}
      onOk={
        /** 将当前选择转换为完整成员职责集合并保存。 */ async () => {
          if (!unit) return
          setSaving(true)
          try {
            const ok = await onSave(
              unit,
              selected.map((candidate) => ({
                userId: candidate.userId,
                duty: duties[candidate.userId] ?? 'member',
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
        title={tr('成员可以同时属于多个组织单元')}
        description={tr(
          '本次只替换当前组织单元的成员；一个单元最多一名负责人，可以有多名副负责人。',
        )}
        style={{ marginBottom: 16 }}
      />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <OrganizationMemberSelector
          candidateContextKey={`${accessScopeKey(scope)}:browseOrganization`}
          scope={{ type: scope.type }}
          multiple
          value={selected.map((candidate) => candidate.userId)}
          selectedCandidates={selected}
          filters={browserFilters}
          request={request}
          resolve={resolve}
          getCandidateDisabled={(candidate) =>
            !unit ||
            !canAddOrganizationAssignment({
              candidate,
              scope,
              unitEffective: unit.effective,
            })
          }
          placeholder={tr('添加或移除组织成员')}
          onChange={(_, candidates) => {
            setSelected(candidates)
            setDuties((current) => ({
              ...Object.fromEntries(candidates.map((candidate) => [candidate.userId, 'member'])),
              ...Object.fromEntries(
                candidates
                  .filter((candidate) => current[candidate.userId] !== undefined)
                  .map((candidate) => [candidate.userId, current[candidate.userId]!] as const),
              ),
            }))
          }}
        />
        <Table
          rowKey="userId"
          size="small"
          pagination={false}
          dataSource={selected}
          scroll={{ y: 300 }}
          columns={[
            { title: tr('姓名'), dataIndex: 'name', width: 150 },
            { title: tr('完整账号'), dataIndex: 'account', width: 210 },
            {
              title: tr('职责'),
              render: (_, candidate) => (
                <Select<OrganizationDuty>
                  value={duties[candidate.userId] ?? 'member'}
                  style={{ width: 150 }}
                  options={[
                    { value: 'member', label: tr('成员') },
                    { value: 'deputy', label: tr('副负责人') },
                    { value: 'leader', label: tr('负责人') },
                  ].map((option) => ({
                    ...option,
                    disabled:
                      !unit ||
                      !canChangeOrganizationDuty({
                        candidate,
                        scope,
                        unitEffective: unit.effective,
                        initialDuty: initialDuties[candidate.userId],
                        nextDuty: option.value as OrganizationDuty,
                      }),
                  }))}
                  onChange={(duty) => changeDuty(candidate.userId, duty)}
                />
              ),
            },
          ]}
          locale={{
            emptyText: <Typography.Text type="secondary">{tr('暂未选择成员')}</Typography.Text>,
          }}
        />
      </Space>
    </Modal>
  )
}
