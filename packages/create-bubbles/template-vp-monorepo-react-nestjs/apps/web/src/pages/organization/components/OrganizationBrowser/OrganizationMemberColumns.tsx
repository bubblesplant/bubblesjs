import type { I18nState } from '@bubblesjs/i18n-core'
import type { ProColumns } from '@ant-design/pro-components'
import { Space, Tag } from 'antd'
import type { OrganizationMemberCandidate, OrganizationUnitRecord } from 'shared/types'

/** 从候选身份中查找其与指定组织单元的关系。 */
function findUnitRelation(candidate: OrganizationMemberCandidate, unitId: string) {
  for (const identity of candidate.identities) {
    const relation = identity.organizationUnits.find((unit) => unit.id === unitId)
    if (relation) return relation
  }
  return undefined
}

/** 创建组织成员浏览表格列，并按当前组织单元补充职责列。 */
export function createOrganizationMemberColumns(
  selectedUnit: OrganizationUnitRecord | undefined,
  tr: I18nState['tr'],
): ProColumns<OrganizationMemberCandidate>[] {
  return [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('搜索姓名或完整账号') },
    },
    { title: tr('姓名'), dataIndex: 'name', search: false, width: 150 },
    { title: tr('完整账号'), dataIndex: 'account', search: false, copyable: true, width: 200 },
    {
      title: tr('成员状态'),
      search: false,
      width: 110,
      render: (_, candidate) => (
        <Tag color={candidate.disabled ? 'default' : 'success'}>
          {candidate.disabled ? tr('当前无效') : tr('有效')}
        </Tag>
      ),
    },
    ...(selectedUnit
      ? [
          {
            title: tr('职责'),
            search: false,
            width: 120,
            render: (_: unknown, candidate: OrganizationMemberCandidate) => {
              const duty = findUnitRelation(candidate, selectedUnit.id)?.duty
              return duty === 'leader'
                ? tr('负责人')
                : duty === 'deputy'
                  ? tr('副负责人')
                  : tr('成员')
            },
          } as ProColumns<OrganizationMemberCandidate>,
        ]
      : []),
    {
      title: tr('组织归属'),
      search: false,
      render: (_, candidate) => (
        <Space size={[0, 4]} wrap>
          {candidate.identities.flatMap((identity) =>
            identity.organizationUnits.map((unit) => (
              <Tag key={`${identity.memberId}:${unit.id}`} color="purple">
                {unit.name}
              </Tag>
            )),
          )}
        </Space>
      ),
    },
    {
      title: tr('岗位'),
      search: false,
      render: (_, candidate) => (
        <Space size={[0, 4]} wrap>
          {candidate.identities.flatMap((identity) =>
            identity.positions.map((position) => (
              <Tag key={`${identity.memberId}:${position.id}`} color="blue">
                {position.name}
              </Tag>
            )),
          )}
        </Space>
      ),
    },
  ]
}
