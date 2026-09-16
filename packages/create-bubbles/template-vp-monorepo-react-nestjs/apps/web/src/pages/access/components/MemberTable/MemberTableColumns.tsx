import type { I18nState } from '@bubblesjs/i18n-core'
import type { ProColumns } from '@ant-design/pro-components'
import { Button, Popconfirm, Space, Tag } from 'antd'
import type { AccountRecord, MemberRecord, OrganizationMemberCandidate } from 'shared/types'

type ManagedMemberRecord = MemberRecord | AccountRecord

interface MemberTableColumnOptions {
  platform: boolean
  companyScope: boolean
  canReadOrganization: boolean
  canAssignOrganization: boolean
  canAssignPositions: boolean
  canManageRoles: boolean
  canManageStatus: boolean
  canRemove: boolean
  candidateByUserId: ReadonlyMap<string, OrganizationMemberCandidate>
  openingOrganizationId?: string
  openingPositionId?: string
  openingRoleId?: string
  tr: I18nState['tr']
  onOpenOrganizations: (record: MemberRecord) => void
  onOpenPositions: (record: MemberRecord) => void
  onOpenRoles: (record: ManagedMemberRecord) => void
  onToggleStatus: (record: ManagedMemberRecord) => void
  onRemove: (record: MemberRecord) => void
}

/**
 * 创建平台账号或工作空间成员表格列。
 * 操作副作用由页面注入，列定义只负责展示、确认提示和触发对应动作。
 */
export function createMemberTableColumns({
  platform,
  companyScope,
  canReadOrganization,
  canAssignOrganization,
  canAssignPositions,
  canManageRoles,
  canManageStatus,
  canRemove,
  candidateByUserId,
  openingOrganizationId,
  openingPositionId,
  openingRoleId,
  tr,
  onOpenOrganizations,
  onOpenPositions,
  onOpenRoles,
  onToggleStatus,
  onRemove,
}: MemberTableColumnOptions): ProColumns<ManagedMemberRecord>[] {
  return [
    {
      title: tr('搜索'),
      dataIndex: 'query',
      hideInTable: true,
      fieldProps: { placeholder: tr('搜索姓名或账号') },
    },
    { title: tr('姓名'), dataIndex: 'name', search: false, width: 150 },
    { title: tr('完整账号'), dataIndex: 'account', search: false, copyable: true, width: 180 },
    {
      title: platform ? tr('账号状态') : tr('成员状态'),
      dataIndex: 'status',
      width: 100,
      valueEnum: {
        active: { text: tr('启用'), status: 'Success' },
        disabled: { text: tr('停用'), status: 'Default' },
        ...(platform ? { locked: { text: tr('锁定'), status: 'Warning' } } : {}),
      },
    },
    ...(!platform
      ? [
          {
            title: tr('账号状态'),
            dataIndex: 'accountStatus',
            width: 100,
            search: false,
            valueEnum: {
              active: { text: tr('启用'), status: 'Success' },
              disabled: { text: tr('停用'), status: 'Default' },
              locked: { text: tr('锁定'), status: 'Warning' },
            },
          } as ProColumns<ManagedMemberRecord>,
        ]
      : []),
    {
      title: platform ? tr('平台角色') : tr('角色'),
      search: false,
      render: (_, record) =>
        'roleNames' in record ? (
          <Space size={[0, 4]} wrap>
            {record.roleNames.map((name) => (
              <Tag key={name}>{name}</Tag>
            ))}
          </Space>
        ) : (
          tr('{count} 个角色', { count: record.platformRoleIds.length })
        ),
    },
    ...(!platform && canReadOrganization
      ? [
          {
            title: tr('组织归属'),
            search: false,
            width: 220,
            render: (_: unknown, record: ManagedMemberRecord) => (
              <Space size={[0, 4]} wrap>
                {candidateByUserId
                  .get((record as MemberRecord).userId)
                  ?.identities.flatMap((identity) => identity.organizationUnits)
                  .map((unit) => (
                    <Tag key={unit.membershipId} color="purple">
                      {unit.name}
                    </Tag>
                  )) ?? '—'}
              </Space>
            ),
          } as ProColumns<ManagedMemberRecord>,
          {
            title: tr('岗位'),
            search: false,
            width: 200,
            render: (_: unknown, record: ManagedMemberRecord) => (
              <Space size={[0, 4]} wrap>
                {candidateByUserId
                  .get((record as MemberRecord).userId)
                  ?.identities.flatMap((identity) => identity.positions)
                  .map((position) => (
                    <Tag key={position.id} color="blue">
                      {position.name}
                    </Tag>
                  )) ?? '—'}
              </Space>
            ),
          } as ProColumns<ManagedMemberRecord>,
        ]
      : []),
    {
      title: tr('加入时间'),
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      search: false,
      width: 180,
    },
    {
      title: tr('操作'),
      valueType: 'option',
      width: platform ? 240 : 390,
      render: (_, record) => (
        <Space size={4} wrap>
          {!platform && canAssignOrganization && (
            <Button
              type="link"
              size="small"
              loading={openingOrganizationId === record.id}
              onClick={() => onOpenOrganizations(record as MemberRecord)}
            >
              {tr('编辑组织')}
            </Button>
          )}
          {!platform && canAssignPositions && (
            <Button
              type="link"
              size="small"
              loading={openingPositionId === record.id}
              onClick={() => onOpenPositions(record as MemberRecord)}
            >
              {tr('编辑岗位')}
            </Button>
          )}
          {canManageRoles && (
            <Button
              type="link"
              size="small"
              loading={openingRoleId === record.id}
              onClick={() => onOpenRoles(record)}
            >
              {tr('分配角色')}
            </Button>
          )}
          {canManageStatus && (
            <Popconfirm
              title={tr('{action}{type}？', {
                action: record.status === 'active' ? tr('停用') : tr('启用'),
                type: platform ? tr('账号') : tr('成员'),
              })}
              description={
                platform
                  ? tr('账号停用后所有工作空间均不可访问；重新启用后须重新登录。')
                  : tr('停用保留成员关系和角色，阻断此身份提供的访问。')
              }
              onConfirm={() => onToggleStatus(record)}
            >
              <Button type="link" size="small" danger={record.status === 'active'}>
                {record.status === 'active' ? tr('停用') : tr('启用')}
              </Button>
            </Popconfirm>
          )}
          {!platform && canRemove && (
            <Popconfirm
              title={tr('移除成员？')}
              description={
                companyScope
                  ? tr('同时清理该成员的企业角色及下属项目关系和角色。重新加入不会恢复旧授权。')
                  : tr('清理该成员在此项目的关系和角色。')
              }
              onConfirm={() => onRemove(record as MemberRecord)}
            >
              <Button type="link" size="small" danger>
                {tr('移除')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]
}
