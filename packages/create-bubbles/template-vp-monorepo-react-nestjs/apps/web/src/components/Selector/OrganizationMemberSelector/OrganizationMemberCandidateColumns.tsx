import type { ProColumns } from '@ant-design/pro-components'
import { Space, Tag, Typography } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { CandidateDisabledReason, OrganizationMemberCandidate } from 'shared/types'

/** 把候选禁选原因转换为用户能直接处理的状态说明。 */
function disabledReasonText(reason: CandidateDisabledReason) {
  switch (reason) {
    case 'accountInactive':
      return '账号不可用'
    case 'memberInactive':
      return '成员已停用'
    case 'scopeInactive':
      return '所属企业或项目已停用'
    case 'organizationInactive':
      return '命中的组织已停用'
    case 'positionInactive':
      return '命中的岗位已停用'
    default:
      return '不可选择'
  }
}

/** 没有标签时展示稳定占位，避免组织、岗位和角色被误认为同一列。 */
function EmptyTagValue() {
  return <Typography.Text type="secondary">—</Typography.Text>
}

/** 构造成员候选表格列，同名组织始终携带来源作用域和完整路径。 */
export function useOrganizationMemberCandidateColumns(): ProColumns<OrganizationMemberCandidate>[] {
  const { tr } = useI18n()
  return [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('搜索姓名或完整账号') },
    },
    { title: tr('姓名'), dataIndex: 'name', search: false, width: 130 },
    {
      title: tr('完整账号'),
      dataIndex: 'account',
      search: false,
      copyable: true,
      width: 180,
    },
    {
      title: tr('企业 / 项目'),
      search: false,
      width: 180,
      render: (_, candidate) => (
        <Space size={[0, 4]} wrap>
          {candidate.identities.map((identity) => (
            <Tag key={identity.memberId}>{identity.scopeName}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: tr('组织'),
      search: false,
      width: 300,
      render: (_, candidate) => {
        const tags = candidate.identities.flatMap((identity) =>
          identity.organizationUnits.map((unit) => (
            <Tag key={`${identity.memberId}:${unit.membershipId}`} color="purple">
              {identity.scopeName} / {unit.fullPath}
            </Tag>
          )),
        )
        return tags.length ? (
          <Space size={[0, 4]} wrap>
            {tags}
          </Space>
        ) : (
          <EmptyTagValue />
        )
      },
    },
    {
      title: tr('岗位'),
      search: false,
      width: 220,
      render: (_, candidate) => {
        const tags = candidate.identities.flatMap((identity) =>
          identity.positions.map((position) => (
            <Tag key={`${identity.memberId}:${position.id}`} color="blue">
              {identity.scopeName} / {position.name}
            </Tag>
          )),
        )
        return tags.length ? (
          <Space size={[0, 4]} wrap>
            {tags}
          </Space>
        ) : (
          <EmptyTagValue />
        )
      },
    },
    {
      title: tr('权限角色'),
      search: false,
      width: 220,
      render: (_, candidate) => {
        const tags = candidate.identities.flatMap((identity) =>
          identity.roles.map((role) => (
            <Tag key={`${identity.memberId}:${role.id}`} color="cyan">
              {identity.scopeName} / {role.name}
            </Tag>
          )),
        )
        return tags.length ? (
          <Space size={[0, 4]} wrap>
            {tags}
          </Space>
        ) : (
          <EmptyTagValue />
        )
      },
    },
    {
      title: tr('状态'),
      search: false,
      fixed: 'right',
      width: 150,
      render: (_, candidate) =>
        candidate.disabled ? (
          <Typography.Text type="danger">
            {tr(disabledReasonText(candidate.disabledReason))}
          </Typography.Text>
        ) : (
          <Typography.Text type="success">{tr('可选择')}</Typography.Text>
        ),
    },
  ]
}
