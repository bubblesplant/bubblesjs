import { ReloadOutlined, StopOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { CompanyMemberInvitationRecord, CompanyMemberInvitationStatus } from 'shared/types'

const PAGE_SIZE = 8

export interface InvitationAction {
  kind: 'revoke' | 'resend'
  record: CompanyMemberInvitationRecord
}

interface InvitationRecordsTableProps {
  records: CompanyMemberInvitationRecord[]
  loading: boolean
  page: number
  total: number
  actionKey?: string
  onPageChange: (page: number) => void
  onAction: (action: InvitationAction) => void
}

const statusColors: Record<CompanyMemberInvitationStatus, string> = {
  pending: 'processing',
  expired: 'warning',
  accepted: 'success',
  revoked: 'default',
}

/** 将邀请状态转换为管理员可识别的本地化文案。 */
function invitationStatusText(
  status: CompanyMemberInvitationStatus,
  tr: (message: string) => string,
): string {
  const statusLabels: Record<CompanyMemberInvitationStatus, string> = {
    pending: tr('待接受'),
    expired: tr('已过期'),
    accepted: tr('已接受'),
    revoked: tr('已撤销'),
  }
  return statusLabels[status]
}

/** 使用当前浏览器区域格式化邀请时间。 */
function formatInvitationDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/** 展示企业邀请状态，并向父弹窗回传分页、撤销和重发操作。 */
export default function InvitationRecordsTable({
  records,
  loading,
  page,
  total,
  actionKey,
  onPageChange,
  onAction,
}: InvitationRecordsTableProps) {
  const { tr } = useI18n()
  const columns: TableColumnsType<CompanyMemberInvitationRecord> = [
    {
      title: tr('状态'),
      dataIndex: 'status',
      width: 110,
      render: (status: CompanyMemberInvitationStatus) => (
        <Tag color={statusColors[status]}>{invitationStatusText(status, tr)}</Tag>
      ),
    },
    {
      title: tr('创建时间'),
      dataIndex: 'createdAt',
      width: 170,
      render: formatInvitationDateTime,
    },
    {
      title: tr('失效时间'),
      dataIndex: 'expiresAt',
      width: 170,
      render: formatInvitationDateTime,
    },
    {
      title: tr('操作'),
      key: 'action',
      width: 180,
      render: (_, record) => {
        if (!['pending', 'expired'].includes(record.status)) return '-'
        return (
          <Space size={4}>
            <Popconfirm
              title={tr('撤销这条邀请？')}
              description={tr('撤销后该链接将无法再被接受。')}
              okText={tr('撤销')}
              cancelText={tr('取消')}
              onConfirm={() => onAction({ kind: 'revoke', record })}
            >
              <Button
                type="link"
                danger
                size="small"
                icon={<StopOutlined />}
                loading={actionKey === `revoke:${record.id}`}
              >
                {tr('撤销')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={tr('重发并生成新链接？')}
              description={tr('旧链接会立即失效，请只发送新链接。')}
              okText={tr('重发')}
              cancelText={tr('取消')}
              onConfirm={() => onAction({ kind: 'resend', record })}
            >
              <Button
                type="link"
                size="small"
                icon={<ReloadOutlined />}
                loading={actionKey === `resend:${record.id}`}
              >
                {tr('重发')}
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <Table<CompanyMemberInvitationRecord>
      rowKey="id"
      size="middle"
      loading={loading}
      columns={columns}
      dataSource={records}
      locale={{ emptyText: tr('暂无邀请记录') }}
      pagination={{
        current: page,
        pageSize: PAGE_SIZE,
        total,
        showSizeChanger: false,
        onChange: onPageChange,
      }}
    />
  )
}
