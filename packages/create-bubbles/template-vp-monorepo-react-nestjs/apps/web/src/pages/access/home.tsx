import { Card, Descriptions, Empty, Space, Tag } from 'antd'
import { useI18n } from '@bubblesjs/i18n-react'
import { navigationTree } from '@/router/access-pages/registry'
import { useAccess } from './use-access'

/** 展示当前工作空间身份、授权信息及可访问的管理入口。 */
export default function WorkspaceHome() {
  const access = useAccess()
  const { tr } = useI18n()
  const typeName =
    access.scope.type === 'platform'
      ? tr('平台')
      : access.scope.type === 'company'
        ? tr('企业')
        : tr('项目')
  const entries = navigationTree(access.menus, access.scope)
  return (
    <div className="workspace-page">
      <div className="workspace-stateless-home">
        <div className="workspace-page-title">
          <h1>{tr('{type}工作台', { type: typeName })}</h1>
          <p>{tr('查看当前身份，选择你需要的管理功能。')}</p>
        </div>
        <Descriptions
          bordered
          column={{ xs: 1, sm: 2 }}
          items={[
            { key: 'name', label: tr('当前用户'), children: access.user.name },
            { key: 'account', label: tr('完整账号'), children: access.user.account },
            { key: 'scope', label: tr('工作空间'), children: typeName },
            {
              key: 'role',
              label: tr('当前身份'),
              children: (
                <Tag color={access.administrator ? 'cyan' : 'default'}>
                  {access.administrator === 'company'
                    ? tr('企业管理员')
                    : access.administrator === 'platform'
                      ? tr('平台管理员')
                      : access.administrator === 'project'
                        ? tr('项目管理员')
                        : tr('普通成员')}
                </Tag>
              ),
            },
          ]}
        />
        <Card title={tr('可用功能')}>
          {entries.length ? (
            <Space size={[24, 18]} wrap>
              {entries
                .flatMap((entry) => entry.routes ?? [entry])
                .filter((entry) => entry.path)
                .map((entry) => (
                  <Link key={entry.key} to={entry.path!}>
                    {entry.icon} {entry.name}
                  </Link>
                ))}
            </Space>
          ) : (
            <Empty description={tr('当前没有可用的菜单，请联系管理员授权。')} />
          )}
        </Card>
      </div>
    </div>
  )
}
