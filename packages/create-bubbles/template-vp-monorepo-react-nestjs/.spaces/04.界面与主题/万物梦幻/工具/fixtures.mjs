/** 虚构数据，仅供视觉验证的独立浏览器上下文使用。 */
export const user = { id: 'qa-user', name: '林间', account: 'qa.visual@example.invalid' }
export const companyScope = { type: 'company', companyId: 'qa-company' }
export const projectScope = { ...companyScope, type: 'project', projectId: 'qa-project' }
export const workspaces = [
  { scope: { type: 'platform' }, name: '平台管理', administrator: 'platform' },
  { scope: companyScope, name: '星屿科技', administrator: 'company' },
  { scope: projectScope, name: '月光计划', companyName: '星屿科技', administrator: 'project' },
]

const pageDefinitions = {
  platform: [
    ['home', '平台工作台', 'DashboardOutlined'],
    ['companies', '企业管理', 'ApartmentOutlined'],
    ['accounts', '全局账号', 'UserOutlined'],
    ['roles', '平台角色', 'SafetyOutlined'],
    ['menus', '菜单管理', 'MenuOutlined'],
    ['audit', '平台操作日志', 'AuditOutlined'],
  ],
  company: [
    ['home', '企业工作台', 'HomeOutlined'],
    ['profile', '企业资料', 'ProfileOutlined'],
    ['members', '企业成员', 'TeamOutlined'],
    ['roles', '企业角色', 'SafetyOutlined'],
    ['projects', '项目管理', 'ProjectOutlined'],
    ['audit', '企业操作日志', 'AuditOutlined'],
  ],
  project: [
    ['home', '项目工作台', 'HomeOutlined'],
    ['profile', '项目资料', 'ProfileOutlined'],
    ['members', '项目成员', 'TeamOutlined'],
    ['roles', '项目角色', 'SafetyOutlined'],
    ['audit', '项目操作日志', 'AuditOutlined'],
  ],
}

function access(scope) {
  const menus = pageDefinitions[scope.type].map(([page, name, icon], sort) => ({
    id: `qa-${scope.type}-${page}`,
    scopeType: scope.type,
    parentId: null,
    type: 'page',
    name,
    icon,
    sort,
    hidden: false,
    status: 'active',
    routeKey: `${scope.type}.${page}`,
    permissionKey: `${scope.type}.${page}.read`,
    protected: false,
    children: [],
  }))
  return {
    user,
    scope,
    administrator: scope.type,
    permissionKeys: menus.flatMap(({ routeKey }) =>
      ['read', 'create', 'update', 'status', 'administrator', 'add', 'roles'].map(
        (operation) => `${routeKey}.${operation}`,
      ),
    ),
    menus,
    menuVersion: 1,
    catalogVersion: '2026-09-09.1',
  }
}

const date = '2026-09-10T02:20:00.000Z'
const company = {
  id: 'qa-company',
  name: '星屿科技',
  code: 'STARISLE',
  description: '连接灵感，创造日常中的新可能。',
  status: 'active',
  version: 1,
  createdAt: date,
  updatedAt: date,
}
const project = {
  ...company,
  id: 'qa-project',
  companyId: 'qa-company',
  name: '月光计划',
  code: 'MOONLIGHT',
}
const companies = [
  company,
  {
    ...company,
    id: 'qa-company-2',
    name: '云间设计',
    code: 'CLOUD',
    description: '让想象拥有形状。',
  },
  { ...company, id: 'qa-company-3', name: '远山工作室', code: 'FARHILL', status: 'disabled' },
]

function page(items, url) {
  const query = url.searchParams.get('query') ?? ''
  const status = url.searchParams.get('status')
  const filtered = items.filter(
    (item) =>
      (!query || `${item.name} ${item.code ?? ''}`.includes(query)) &&
      (!status || item.status === status),
  )
  return { items: filtered, total: filtered.length, page: 1, pageSize: 20 }
}

export function fixtureResponse(url, scenario) {
  const path = url.pathname.replace(/^\/api/, '')
  if (path === '/workspaces') {
    return { user, workspaces: scenario === 'empty-workspaces' ? [] : workspaces }
  }
  if (path === '/platform/access') return access({ type: 'platform' })
  if (path === '/companies/qa-company/access') return access(companyScope)
  if (path === '/companies/qa-company/projects/qa-project/access') return access(projectScope)
  if (path === '/platform/companies') return page(scenario === 'empty' ? [] : companies, url)
  if (path === '/companies/qa-company/projects') return page([project], url)
  if (path === '/companies/qa-company') return { ...company, administrators: [] }
  if (path === '/companies/qa-company/projects/qa-project')
    return { ...project, administrators: [] }
  if (path === '/platform/accounts') {
    return page(
      [{ ...user, status: 'active', createdAt: date, updatedAt: date, platformRoleIds: [] }],
      url,
    )
  }
  if (path.endsWith('/roles') || path.endsWith('/members') || path.endsWith('/audit-logs')) {
    return page([], url)
  }
  return undefined
}
