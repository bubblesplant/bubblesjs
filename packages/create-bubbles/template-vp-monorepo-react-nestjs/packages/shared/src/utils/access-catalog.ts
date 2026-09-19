import type { AccessPageDefinition, PermissionDefinition, ScopeType } from '../types'

export const ACCESS_CATALOG_VERSION = '2026-09-19.1'
export const ACCESS_DEFAULT_PAGE_SIZE = 20
export const ACCESS_MAX_PAGE_SIZE = 100
export const ACCESS_CODE_PATTERN = /^[A-Za-z0-9_-]+$/
export const ACCESS_ICON_KEY_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/

interface OperationSpec {
  suffix: string
  title: string
  icon: string
  adminOnly?: boolean
}

interface PageSpec {
  scopeType: ScopeType
  routeKey: string
  path: string
  title: string
  icon: string
  operations: readonly OperationSpec[]
}

const roleOperations: readonly OperationSpec[] = [
  { suffix: 'create', title: '创建角色', icon: 'add' },
  { suffix: 'update', title: '修改角色', icon: 'edit' },
  { suffix: 'delete', title: '删除角色', icon: 'delete' },
  { suffix: 'permissions', title: '设置角色权限', icon: 'permissions' },
]

const memberOperations: readonly OperationSpec[] = [
  { suffix: 'add', title: '添加成员', icon: 'add' },
  { suffix: 'status', title: '启用或停用成员', icon: 'status' },
  { suffix: 'remove', title: '移除成员', icon: 'remove' },
  { suffix: 'roles', title: '分配成员角色', icon: 'roles' },
]

const pageSpecs: readonly PageSpec[] = [
  {
    scopeType: 'platform',
    routeKey: 'platform.home',
    path: '/platform',
    title: '平台工作台',
    icon: 'dashboard',
    operations: [],
  },
  {
    scopeType: 'platform',
    routeKey: 'platform.companies',
    path: '/platform/companies',
    title: '企业管理',
    icon: 'companies',
    operations: [
      { suffix: 'create', title: '开通企业', adminOnly: true },
      { suffix: 'status', title: '启用或停用企业' },
      { suffix: 'administrator', title: '设置企业管理员', adminOnly: true },
      { suffix: 'hierarchy', title: '调整企业层级' },
    ],
  },
  {
    scopeType: 'platform',
    routeKey: 'platform.accounts',
    path: '/platform/accounts',
    title: '全局账号',
    icon: 'accounts',
    operations: [
      { suffix: 'status', title: '启用或停用账号' },
      { suffix: 'roles', title: '分配平台角色' },
    ],
  },
  {
    scopeType: 'platform',
    routeKey: 'platform.roles',
    path: '/platform/roles',
    title: '平台角色',
    icon: 'roles',
    operations: roleOperations,
  },
  {
    scopeType: 'platform',
    routeKey: 'platform.menus',
    path: '/platform/menus',
    title: '菜单管理',
    icon: 'menus',
    operations: [
      { suffix: 'create', title: '新增菜单节点' },
      { suffix: 'update', title: '修改菜单节点' },
      { suffix: 'delete', title: '删除菜单节点' },
      { suffix: 'cleanup', title: '清理废弃权限', adminOnly: true },
    ],
  },
  {
    scopeType: 'platform',
    routeKey: 'platform.audit',
    path: '/platform/audit',
    title: '平台操作日志',
    icon: 'audit-log',
    operations: [],
  },
  {
    scopeType: 'company',
    routeKey: 'company.home',
    path: '/companies/:companyId',
    title: '企业工作台',
    icon: 'home',
    operations: [],
  },
  {
    scopeType: 'company',
    routeKey: 'company.profile',
    path: '/companies/:companyId/profile',
    title: '企业资料',
    icon: 'profile',
    operations: [{ suffix: 'update', title: '修改企业资料' }],
  },
  {
    scopeType: 'company',
    routeKey: 'company.members',
    path: '/companies/:companyId/members',
    title: '企业成员',
    icon: 'members',
    operations: memberOperations,
  },
  {
    scopeType: 'company',
    routeKey: 'company.roles',
    path: '/companies/:companyId/roles',
    title: '企业角色',
    icon: 'roles',
    operations: roleOperations,
  },
  {
    scopeType: 'company',
    routeKey: 'company.projects',
    path: '/companies/:companyId/projects',
    title: '项目管理',
    icon: 'projects',
    operations: [
      { suffix: 'create', title: '创建项目', adminOnly: true },
      { suffix: 'status', title: '启用或停用项目' },
      { suffix: 'administrator', title: '设置项目管理员', adminOnly: true },
    ],
  },
  {
    scopeType: 'company',
    routeKey: 'company.organization',
    path: '/companies/:companyId/organization',
    title: '企业组织',
    icon: 'organization',
    operations: [
      { suffix: 'create', title: '创建组织单元' },
      { suffix: 'update', title: '修改组织单元' },
      { suffix: 'move', title: '移动组织单元' },
      { suffix: 'assign', title: '分配组织成员' },
    ],
  },
  {
    scopeType: 'company',
    routeKey: 'company.positions',
    path: '/companies/:companyId/positions',
    title: '企业岗位',
    icon: 'positions',
    operations: [
      { suffix: 'create', title: '创建岗位' },
      { suffix: 'update', title: '修改岗位' },
      { suffix: 'assign', title: '分配岗位成员' },
    ],
  },
  {
    scopeType: 'company',
    routeKey: 'company.organization.templates',
    path: '/companies/:companyId/organization/templates',
    title: '项目组织模板',
    icon: 'organization-template',
    operations: [
      { suffix: 'create', title: '创建组织模板' },
      { suffix: 'update', title: '修改组织模板' },
    ],
  },
  {
    scopeType: 'company',
    routeKey: 'company.audit',
    path: '/companies/:companyId/audit',
    title: '企业操作日志',
    icon: 'audit-log',
    operations: [],
  },
  {
    scopeType: 'project',
    routeKey: 'project.home',
    path: '/companies/:companyId/projects/:projectId',
    title: '项目工作台',
    icon: 'home',
    operations: [],
  },
  {
    scopeType: 'project',
    routeKey: 'project.profile',
    path: '/companies/:companyId/projects/:projectId/profile',
    title: '项目资料',
    icon: 'profile',
    operations: [{ suffix: 'update', title: '修改项目资料' }],
  },
  {
    scopeType: 'project',
    routeKey: 'project.members',
    path: '/companies/:companyId/projects/:projectId/members',
    title: '项目成员',
    icon: 'members',
    operations: memberOperations,
  },
  {
    scopeType: 'project',
    routeKey: 'project.roles',
    path: '/companies/:companyId/projects/:projectId/roles',
    title: '项目角色',
    icon: 'roles',
    operations: roleOperations,
  },
  {
    scopeType: 'project',
    routeKey: 'project.organization',
    path: '/companies/:companyId/projects/:projectId/organization',
    title: '项目组织',
    icon: 'organization',
    operations: [
      { suffix: 'create', title: '创建组织单元' },
      { suffix: 'update', title: '修改组织单元' },
      { suffix: 'move', title: '移动组织单元' },
      { suffix: 'assign', title: '分配组织成员' },
    ],
  },
  {
    scopeType: 'project',
    routeKey: 'project.positions',
    path: '/companies/:companyId/projects/:projectId/positions',
    title: '项目岗位',
    icon: 'positions',
    operations: [
      { suffix: 'create', title: '创建岗位' },
      { suffix: 'update', title: '修改岗位' },
      { suffix: 'assign', title: '分配岗位成员' },
    ],
  },
  {
    scopeType: 'project',
    routeKey: 'project.audit',
    path: '/companies/:companyId/projects/:projectId/audit',
    title: '项目操作日志',
    icon: 'audit-log',
    operations: [],
  },
]

export const ACCESS_PAGE_CATALOG: readonly AccessPageDefinition[] = pageSpecs.map((page) => ({
  scopeType: page.scopeType,
  routeKey: page.routeKey,
  path: page.path,
  title: page.title,
  permissionKey: `${page.routeKey}.read`,
  icon: page.icon,
  operationKeys: page.operations.map((operation) => `${page.routeKey}.${operation.suffix}`),
}))

export const ACCESS_PERMISSION_CATALOG: readonly PermissionDefinition[] = pageSpecs.flatMap(
  /** 从页面目录派生读取权限和操作权限，并为操作声明所属页面依赖。 */
  (page): PermissionDefinition[] => [
    {
      key: `${page.routeKey}.read`,
      scopeType: page.scopeType,
      kind: 'page',
      title: page.title,
      routeKey: page.routeKey,
      pagePermissionKey: null,
      adminOnly: false,
      deprecated: false,
    },
    ...page.operations.map((operation): PermissionDefinition => ({
      key: `${page.routeKey}.${operation.suffix}`,
      scopeType: page.scopeType,
      kind: 'operation',
      title: operation.title,
      routeKey: page.routeKey,
      pagePermissionKey: `${page.routeKey}.read`,
      adminOnly: operation.adminOnly ?? false,
      deprecated: false,
    })),
  ],
)

export const ACCESS_PROTECTED_ROUTE_KEYS: readonly string[] = [
  'platform.companies',
  'platform.accounts',
  'platform.roles',
  'platform.menus',
]

export const ACCESS_BUILTIN_MEMBER_PERMISSIONS: Readonly<Record<ScopeType, readonly string[]>> = {
  platform: ['platform.home.read'],
  company: ['company.home.read', 'company.projects.read'],
  project: ['project.home.read'],
}
