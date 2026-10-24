import { Space, Tag, Typography } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import type { AdministratorSummary } from 'shared/types'

/** 在企业列表和管理员设置中展示完整身份及有效状态，避免同名账号混淆。 */
export default function AdministratorList({
  administrators,
}: {
  administrators: AdministratorSummary[]
}) {
  const { tr } = useI18n()
  if (administrators.length === 0)
    return <Typography.Text type="secondary">{tr('暂无管理员')}</Typography.Text>

  return (
    <Space orientation="vertical" size={4}>
      {administrators.map((admin) => (
        <Space key={admin.id} size={4} wrap>
          <span style={{ overflowWrap: 'anywhere' }}>
            {admin.name} ({admin.account})
          </span>
          <Tag color={admin.effective ? 'success' : 'default'}>
            {admin.effective ? tr('有效') : tr('当前无效')}
          </Tag>
        </Space>
      ))}
    </Space>
  )
}
