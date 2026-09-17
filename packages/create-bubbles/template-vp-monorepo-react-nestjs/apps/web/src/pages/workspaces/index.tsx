import { logout } from '@/api/auth'
import Brand from '@/components/Brand/Brand'
import LocaleSwitch from '@/components/LocaleSwitch/LocaleSwitch'
import PageLoading from '@/components/Loading/PageLoading'
import '@/layouts/WorkspaceLayout/workspace.css'
import { clearWorkspaceRequests } from '@/utils/request/workspace'
import { cookie } from '@/utils/storage/cookie'
import { ArrowRightOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons'
import { App, Button, Card, Empty, Input, Space, Tag } from 'antd'
import { accessScopeBasePath, accessScopeKey } from 'shared/utils'
import { useI18n } from '@bubblesjs/i18n-react'
import { getWorkspaceState } from './state'

/** 展示可访问工作空间，支持搜索、权限刷新及退出登录。 */
export default function WorkspacesPage() {
  const data = getWorkspaceState().workspaces
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const { message } = App.useApp()
  const { tr } = useI18n()

  useEffect(
    /** 注册窗口焦点刷新，在组件卸载时取消监听。 */ () => {
      /** 窗口重新获得焦点时，在路由空闲状态下刷新工作空间列表。 */
      const refresh = () => {
        if (revalidator.state === 'idle') void revalidator.revalidate()
      }
      window.addEventListener('focus', refresh)
      return () => window.removeEventListener('focus', refresh)
    },
    [revalidator],
  )

  /** 结束当前登录会话，清理本地令牌并返回登录页。 */
  async function handleLogout() {
    clearWorkspaceRequests()
    try {
      await logout().send(true)
      cookie.remove('token')
      void navigate('/login', { replace: true })
    } catch (error) {
      void message.error(error instanceof Error ? error.message : tr('退出失败，请重试'))
    }
  }

  if (!data) return <PageLoading />
  const entries = data.workspaces.filter((item) =>
    `${item.name} ${item.companyName ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <main className="workspace-landing">
      <title>{tr('工作空间 - 万物')}</title>
      <header className="workspace-landing-header">
        <Brand variant="workspace" />
        <Space>
          <span>{data.user.name}</span>
          <LocaleSwitch />
          <Button type="text" icon={<LogoutOutlined />} onClick={() => void handleLogout()}>
            {tr('退出登录')}
          </Button>
        </Space>
      </header>
      <section className="workspace-landing-main">
        <div className="workspace-page-title">
          <h1>{tr('选择工作空间')}</h1>
          <p>{tr('你好，{name}。进入企业或项目，继续你的工作。', { name: data.user.name })}</p>
        </div>
        <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between' }} wrap>
          <Input.Search
            placeholder={tr('搜索企业或项目')}
            aria-label={tr('搜索工作空间')}
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ maxWidth: 340 }}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={revalidator.state === 'loading'}
            onClick={() => void revalidator.revalidate()}
          >
            {tr('刷新工作空间')}
          </Button>
        </Space>
        {data.workspaces.length === 0 ? (
          <Card>
            <Empty
              description={
                <>
                  <strong>{tr('暂未加入企业，请联系管理员获取邀请链接')}</strong>
                  <p>{tr('登录后确认加入企业；加入后，刷新此页即可进入。')}</p>
                </>
              }
            />
          </Card>
        ) : entries.length === 0 ? (
          <Empty description={tr('没有匹配的工作空间，请调整搜索条件。')} />
        ) : (
          <div className="workspace-grid">
            {entries.map((entry) => (
              <Card
                key={accessScopeKey(entry.scope)}
                className={`workspace-card workspace-card-${entry.scope.type}`}
              >
                <Space>
                  <Tag>
                    {entry.scope.type === 'platform'
                      ? tr('平台')
                      : entry.scope.type === 'company'
                        ? tr('企业')
                        : tr('项目')}
                  </Tag>
                  {entry.administrator && <Tag color="purple">{tr('管理员')}</Tag>}
                </Space>
                <h3>{entry.name}</h3>
                <p>
                  {entry.companyName ??
                    (entry.scope.type === 'platform'
                      ? tr('管理企业、账号与平台功能')
                      : tr('企业协作工作空间'))}
                </p>
                <Link to={accessScopeBasePath(entry.scope)}>
                  {tr('进入空间')} <ArrowRightOutlined />
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
