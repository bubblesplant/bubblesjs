import { logout } from '@/api/auth'
import AccountMenu from '@/components/AccountMenu/AccountMenu'
import Brand from '@/components/Brand/Brand'
import LocaleSwitch from '@/components/LocaleSwitch/LocaleSwitch'
import PageLoading from '@/components/Loading/PageLoading'
import ChangePasswordDialog, {
  type ChangePasswordDialogRef,
} from '@/components/PasswordActions/ChangePasswordDialog'
import '@/layouts/WorkspaceLayout/workspace.css'
import { clearWorkspaceRequests } from '@/utils/request/workspace'
import { cookie } from '@/utils/storage/cookie'
import { ArrowLeftOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { App, Button, Card, Empty, Input, Pagination, Select } from 'antd'
import type { ScopeType } from 'shared/types'
import { getRequestErrorMessage, accessScopeBasePath, accessScopeKey } from 'shared/utils'
import { useI18n } from '@bubblesjs/i18n-react'
import WorkspaceCard from './components/WorkspaceCard'
import { useUserStore } from '@/store/user'

const PAGE_SIZE = 6
const SPACE_TYPES = [
  { value: 'all', label: '全部' },
  { value: 'platform', label: '平台' },
  { value: 'company', label: '企业' },
  { value: 'project', label: '项目' },
] as const

/** 按真实授权清单筛选并分页展示空间，保留全局账号操作与权限刷新。 */
export default function WorkspacesPage() {
  const workspaceState = useUserStore()
  const { invalidateWorkspaces } = workspaceState
  const data = workspaceState.workspaces
  const [query, setQuery] = useState('')
  const [type, setType] = useState<ScopeType | 'all'>('all')
  const [company, setCompany] = useState('')
  const [page, setPage] = useState(1)
  const changePasswordRef = useRef<ChangePasswordDialogRef>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const { message } = App.useApp()
  const { tr } = useI18n()
  const allEntries = data?.workspaces ?? []
  const companies = new Map<string, string>()
  for (const entry of allEntries) {
    if (entry.scope.type === 'company') {
      companies.set(entry.scope.companyId, entry.name)
    }
  }
  for (const entry of allEntries) {
    if (entry.scope.type === 'project') {
      const companyId = entry.scope.companyId
      const name = companies.get(companyId)
      if (!name || name === companyId) {
        companies.set(companyId, entry.companyName || companyId)
      }
    }
  }
  const activeCompany = companies.has(company) ? company : ''
  const search = query.trim().toLowerCase()
  const matching = allEntries.filter(
    (entry) =>
      (
        entry.name +
        ' ' +
        (entry.scope.type === 'platform' ? '' : (companies.get(entry.scope.companyId) ?? ''))
      )
        .toLowerCase()
        .includes(search) &&
      (!activeCompany ||
        (entry.scope.type !== 'platform' && entry.scope.companyId === activeCompany)),
  )
  const counts = {
    all: matching.length,
    platform: matching.filter((entry) => entry.scope.type === 'platform').length,
    company: matching.filter((entry) => entry.scope.type === 'company').length,
    project: matching.filter((entry) => entry.scope.type === 'project').length,
  }
  const filtered = matching.filter((entry) => type === 'all' || entry.scope.type === type)
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)))
  const entries = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const previousKey: unknown = location.state?.workspaceKey
  const previousEntry = allEntries.find((entry) => accessScopeKey(entry.scope) === previousKey)

  useEffect(
    /** 清单刷新或撤权后修正页码和失效企业条件，避免空白页及恢复旧页码。 */ () => {
      if (page !== currentPage) setPage(currentPage)
      if (company !== activeCompany) setCompany(activeCompany)
    },
    [page, currentPage, company, activeCompany],
  )

  useEffect(
    /** 注册窗口焦点刷新，在组件卸载时取消监听。 */ () => {
      /** 窗口重新获得焦点时，在路由空闲状态下刷新授权清单。 */
      const refresh = () => {
        if (document.visibilityState === 'hidden' || revalidator.state !== 'idle') return
        invalidateWorkspaces()
        void revalidator.revalidate()
      }
      window.addEventListener('focus', refresh)
      window.addEventListener('workspace-access-refresh', refresh)
      return () => {
        window.removeEventListener('focus', refresh)
        window.removeEventListener('workspace-access-refresh', refresh)
      }
    },
    [revalidator, invalidateWorkspaces],
  )

  /** 结束当前登录会话，清理本地令牌并返回登录页。 */
  async function handleLogout() {
    clearWorkspaceRequests()
    try {
      await logout().send(true)
      cookie.remove('token')
      void navigate('/login', { replace: true })
    } catch (error) {
      void message.error(getRequestErrorMessage(error, tr('退出失败，请重试')))
    }
  }

  /** 重置所有筛选，回到第一页的完整授权清单。 */
  function clearFilters() {
    setQuery('')
    setType('all')
    setCompany('')
    setPage(1)
  }

  if (workspaceState.error) throw workspaceState.error
  if (!data) return <PageLoading />

  return (
    <main className="workspace-landing">
      <title>{tr('工作空间 - 万物')}</title>
      <header className="workspace-landing-header">
        <Brand variant="workspace" />
        <div className="workspace-landing-actions">
          <LocaleSwitch />
          <span className="workspace-landing-action-divider" aria-hidden="true" />
          <AccountMenu
            user={data.user}
            onChangePassword={() => changePasswordRef.current?.show()}
            onLogout={handleLogout}
          />
        </div>
      </header>
      <section className="workspace-landing-main">
        <div className="workspace-page-heading">
          <div className="workspace-page-title">
            <h1>{tr('选择工作空间')}</h1>
            <p>{tr('你好，{name}。进入企业或项目，继续你的工作。', { name: data.user.name })}</p>
          </div>
          {previousEntry && (
            <Link
              className="workspace-return-current"
              to={accessScopeBasePath(previousEntry.scope)}
              title={previousEntry.name}
              aria-label={[tr('返回当前空间'), previousEntry.name].join(' · ')}
            >
              <ArrowLeftOutlined />
              <span>{tr('返回当前空间')}</span>
              <span className="workspace-return-name">{previousEntry.name}</span>
            </Link>
          )}
        </div>
        <div className="workspace-filters">
          <Input
            className="workspace-search"
            prefix={<SearchOutlined />}
            placeholder={tr('搜索空间名称或所属企业')}
            aria-label={tr('搜索工作空间')}
            allowClear
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
          />
          <Select
            className="workspace-company-filter"
            aria-label={tr('所属企业')}
            value={activeCompany}
            showSearch={companies.size > 5 ? { optionFilterProp: 'label' } : false}
            options={[
              { value: '', label: tr('全部企业') },
              ...[...companies].map(([value, label]) => ({ value, label })),
            ]}
            onChange={(value) => {
              setCompany(value)
              setPage(1)
            }}
          />
          <Button
            className="workspace-refresh"
            icon={<ReloadOutlined />}
            loading={workspaceState.loading || revalidator.state === 'loading'}
            onClick={() => {
              invalidateWorkspaces()
              void revalidator.revalidate()
            }}
          >
            {tr('刷新工作空间')}
          </Button>
        </div>
        <div className="workspace-categories" role="group" aria-label={tr('空间类型')}>
          {SPACE_TYPES.map((category) => (
            <button
              key={category.value}
              type="button"
              aria-pressed={type === category.value}
              onClick={() => {
                setType(category.value)
                setPage(1)
              }}
            >
              {tr(category.label)}
              <span className="workspace-category-count">{counts[category.value]}</span>
            </button>
          ))}
        </div>
        {data.workspaces.length === 0 ? (
          <Card className="workspace-empty">
            <Empty
              description={
                <>
                  <strong>{tr('暂未加入企业，请联系企业管理员')}</strong>
                  <p>{tr('加入企业后，刷新此页即可进入。')}</p>
                </>
              }
            />
          </Card>
        ) : entries.length === 0 ? (
          <Card className="workspace-empty">
            <Empty description={tr('没有匹配的工作空间，请调整搜索条件。')}>
              <Button onClick={clearFilters}>{tr('清空筛选条件')}</Button>
            </Empty>
          </Card>
        ) : (
          <>
            <div className="workspace-grid">
              {entries.map((entry) => (
                <WorkspaceCard
                  key={accessScopeKey(entry.scope)}
                  entry={entry}
                  companyName={
                    entry.scope.type === 'project'
                      ? companies.get(entry.scope.companyId)
                      : undefined
                  }
                  current={previousKey === accessScopeKey(entry.scope)}
                />
              ))}
            </div>
            <footer className="workspace-pagination">
              <p aria-live="polite">
                {tr('共 {count} 个空间', { count: filtered.length })}
                <span>
                  {tr('当前展示 {start}–{end}', {
                    start: (currentPage - 1) * PAGE_SIZE + 1,
                    end: Math.min(currentPage * PAGE_SIZE, filtered.length),
                  })}
                </span>
              </p>
              <Pagination
                current={currentPage}
                total={filtered.length}
                pageSize={PAGE_SIZE}
                showSizeChanger={false}
                showLessItems
                onChange={setPage}
              />
              <span className="workspace-page-size">
                {tr('{count} 个 / 页', { count: PAGE_SIZE })}
              </span>
            </footer>
          </>
        )}
      </section>
      <ChangePasswordDialog ref={changePasswordRef} />
    </main>
  )
}
