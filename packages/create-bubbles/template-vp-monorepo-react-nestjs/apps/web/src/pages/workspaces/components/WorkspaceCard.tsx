import { ArrowRightOutlined, CheckOutlined } from '@ant-design/icons'
import { useI18n } from '@bubblesjs/i18n-react'
import { Card } from 'antd'
import type { WorkspaceEntry } from 'shared/types'
import { accessScopeBasePath } from 'shared/utils'

interface WorkspaceCardProps {
  entry: WorkspaceEntry
  current: boolean
  companyName?: string
}

const TYPE_LABELS = { platform: '平台', company: '企业', project: '项目' } as const

/** 展示一个授权空间的类型、角色与归属，通过唯一链接进入或返回该空间。 */
export default function WorkspaceCard({ entry, current, companyName }: WorkspaceCardProps) {
  const { tr } = useI18n()
  const description =
    entry.scope.type === 'project'
      ? tr('所属企业 · {name}', { name: companyName || entry.companyName || entry.scope.companyId })
      : entry.scope.type === 'platform'
        ? tr('管理企业、账号与平台功能')
        : tr('企业协作工作空间')

  return (
    <Card
      className={`workspace-card workspace-card-${entry.scope.type}${current ? ' workspace-card-current' : ''}`}
    >
      <div className="workspace-card-meta">
        <span className="workspace-type-tag">{tr(TYPE_LABELS[entry.scope.type])}</span>
        <span className="workspace-role">{entry.administrator ? tr('管理员') : tr('成员')}</span>
        {current && (
          <span className="workspace-current-mark">
            <CheckOutlined /> {tr('当前空间')}
          </span>
        )}
      </div>
      <h3 title={entry.name}>{entry.name}</h3>
      <p title={description}>{description}</p>
      <Link
        className="workspace-enter"
        to={accessScopeBasePath(entry.scope)}
        aria-label={[current ? tr('返回空间') : tr('进入空间'), entry.name].join(' · ')}
      >
        {current ? tr('返回空间') : tr('进入空间')} <ArrowRightOutlined />
      </Link>
    </Card>
  )
}
