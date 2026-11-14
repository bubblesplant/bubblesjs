import {
  ACCESS_PAGE_CATALOG,
  ACCESS_PERMISSION_CATALOG,
  ACCESS_CATALOG_VERSION,
} from '../../../../packages/shared/dist/utils.js'

export const user = { id: 'qa-user', name: '演示用户', account: 'vue_qa' }
export const scopes = [
  { type: 'platform' },
  { type: 'company', companyId: 'qa-company' },
  { type: 'project', companyId: 'qa-company', projectId: 'qa-project' },
]
export const pages = ACCESS_PAGE_CATALOG
const date = '2026-11-14T00:00:00.000Z'
const common = {
  status: 'active',
  version: 1,
  createdAt: date,
  updatedAt: date,
  description: '虚构验收数据',
}
const company = {
  ...common,
  id: 'qa-company',
  name: '星屿演示企业',
  code: 'STAR',
  administrators: [],
}
const project = {
  ...common,
  id: 'qa-project',
  companyId: company.id,
  name: '月光演示项目',
  code: 'MOON',
  administrators: [],
}

/** 将共享目录转换为与页面注册一致的虚构菜单。 */
export function access(scope) {
  const menus = pages
    .filter((p) => p.scopeType === scope.type)
    .map((p, sort) => ({
      id: `qa-${p.routeKey}`,
      scopeType: scope.type,
      parentId: null,
      type: 'page',
      name: p.title,
      icon: p.icon,
      sort,
      hidden: false,
      status: 'active',
      routeKey: p.routeKey,
      permissionKey: p.permissionKey,
      protected: false,
      children: [],
    }))
  return {
    user,
    scope,
    administrator: scope.type,
    menus,
    permissionKeys: ACCESS_PERMISSION_CATALOG.filter((p) => p.scopeType === scope.type).map(
      (p) => p.key,
    ),
    menuVersion: 1,
    catalogVersion: ACCESS_CATALOG_VERSION,
  }
}

/** 构造三级空间路径。 */
export function base(scope) {
  return scope.type === 'platform'
    ? '/platform'
    : scope.type === 'company'
      ? `/companies/${scope.companyId}`
      : `/companies/${scope.companyId}/projects/${scope.projectId}`
}

/** 拦截全部业务 API，任何未配置请求均返回失败，禁止漏发真实服务。 */
export async function install(context) {
  const state = {
    writes: [],
    unexpected: [],
    failNext: '',
    deny: '',
    unauthorized: '',
    accesses: [],
  }
  const dictionaries = new Map(
    scopes.map((scope) => [
      scope.type,
      [
        {
          ...common,
          id: `dict-${scope.type}`,
          scope,
          name: '计量单位',
          code: 'units',
          items: [{ value: 'm', label: '米', sort: 0, status: 'active' }],
        },
      ],
    ]),
  )
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname.replace(/^\/api/, ''),
        method = req.method()
      const reply = (json, status = 200) => route.fulfill({ status, json })
      const paged = (items) => ({
        items,
        total: items.length,
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 10),
      })
      if (state.unauthorized && path === state.unauthorized)
        return reply({ message: '会话已失效' }, 401)
      if (state.deny && path.endsWith('/access')) {
        const result = access(scopes.find((s) => path === `${base(s)}/access`))
        result.permissionKeys = result.permissionKeys.filter((p) => p !== state.deny)
        return reply(result)
      }
      if (method !== 'GET') {
        // 密码及测试会话均不写入持久化证据。
        const body = req.postDataJSON() || {}
        state.writes.push({
          path,
          method,
          body: Object.fromEntries(Object.entries(body).filter(([key]) => !/password/i.test(key))),
        })
        if (state.failNext && path.endsWith(state.failNext)) {
          state.failNext = ''
          return reply({ message: '模拟版本冲突，请刷新后重试' }, 409)
        }
        if (path === '/auth/login')
          return reply({
            accessToken: 'qa-only-noncredential',
            absoluteExpiresAt: '2099-01-01T00:00:00Z',
          })
        if (path === '/auth/register') return reply(user, 201)
        if (path === '/auth/logout') return reply({ loggedOut: true })
        if (path.startsWith('/platform/menus'))
          return reply({ items: access(scopes[0]).menus, version: 2, scopeType: 'platform' })
        if (path.endsWith('/resolve'))
          return reply([candidate(scopes.find((s) => path.startsWith(base(s))) || scopes[1])])
        for (const scope of scopes) {
          const root = base(scope),
            records = dictionaries.get(scope.type)
          if (path === `${root}/dictionaries` && method === 'POST') {
            const record = { ...common, ...body, id: `dict-new-${records.length}`, scope }
            records.unshift(record)
            return reply(record, 201)
          }
          if (path.startsWith(`${root}/dictionaries/`) && method === 'PATCH') {
            const record = records.find((r) => r.id === path.split('/').at(-1))
            Object.assign(record, body, { version: record.version + 1 })
            delete record.expectedVersion
            return reply(record)
          }
        }
        return reply({ ...common, ...body, id: 'qa-new', items: [] })
      }
      if (path === '/workspaces')
        return reply({
          user,
          workspaces: scopes.map((scope) => ({
            scope,
            name:
              scope.type === 'platform'
                ? '平台管理'
                : scope.type === 'company'
                  ? company.name
                  : project.name,
            companyName: company.name,
            administrator: scope.type,
          })),
        })
      if (path === '/auth/me') return reply(user)
      if (path === '/dictionary-options') return reply([{ label: '米', value: 'm' }])
      if (path === '/platform/companies' || path === '/platform/companies/qa-company')
        return reply(path.endsWith('qa-company') ? company : paged([company]))
      if (path === '/platform/accounts')
        return reply(paged([{ ...common, ...user, platformRoleIds: [], platformRoles: [] }]))
      if (path === '/platform/account-candidates') return reply(paged([candidate(scopes[1])]))
      if (path === '/platform/permissions/cleanup-preview')
        return reply({
          catalogVersion: ACCESS_CATALOG_VERSION,
          deploymentId: null,
          eligible: false,
          items: [],
          blockedReasons: ['缺少有效且完整的部署证明'],
          proofDigest: null,
          totals: { permissions: 0, menus: 0, roleAssignments: 0 },
        })
      if (path === '/platform/menus') {
        const s = { type: url.searchParams.get('scopeType') || 'platform' }
        return reply({ items: access(s).menus, version: 1, scopeType: s.type })
      }
      if (path === '/platform/function-catalog') {
        const scopeType = url.searchParams.get('scopeType') || 'platform'
        return reply({
          catalogVersion: ACCESS_CATALOG_VERSION,
          items: ACCESS_PERMISSION_CATALOG.filter((p) => p.scopeType === scopeType),
          pages: pages.filter((p) => p.scopeType === scopeType),
          permissions: ACCESS_PERMISSION_CATALOG.filter((p) => p.scopeType === scopeType),
          scopeType,
        })
      }
      for (const scope of [...scopes].reverse()) {
        const root = base(scope)
        if (!path.startsWith(root)) continue
        const tail = path.slice(root.length)
        if (tail === '/access') {
          state.accesses.push(scope.type)
          return reply(access(scope))
        }
        if (!tail) return reply(scope.type === 'project' ? project : company)
        if (tail === '/projects') return reply(paged([project]))
        if (tail.endsWith('/administrators')) return reply([])
        if (tail === '/roles') return reply(paged([role(scope)]))
        if (tail.startsWith('/roles/')) return reply(role(scope))
        if (tail === '/permissions')
          return reply({
            catalogVersion: ACCESS_CATALOG_VERSION,
            items: ACCESS_PERMISSION_CATALOG.filter((p) => p.scopeType === scope.type),
            permissions: ACCESS_PERMISSION_CATALOG.filter((p) => p.scopeType === scope.type),
            grantablePermissionKeys: access(scope).permissionKeys,
            version: 1,
          })
        if (tail === '/members')
          return reply(
            paged([
              {
                ...common,
                id: 'qa-member',
                userId: user.id,
                name: user.name,
                account: user.account,
                roleIds: ['qa-role'],
                roleNames: ['演示角色'],
                roles: [{ id: 'qa-role', name: '演示角色' }],
                builtin: 'member',
                memberStatus: 'active',
                accountStatus: 'active',
              },
            ]),
          )
        if (tail === '/audit-logs')
          return reply(
            paged([
              {
                id: 'qa-audit',
                actor: user,
                actorName: user.name,
                actorAccount: user.account,
                action: 'role.create',
                targetType: 'role',
                targetId: 'qa-role',
                result: 'success',
                createdAt: date,
                summary: { name: '演示角色' },
              },
            ]),
          )
        if (tail === '/dictionaries') return reply(paged(dictionaries.get(scope.type)))
        if (tail === '/organization/tree')
          return reply({
            units: url.searchParams.get('parentId')
              ? []
              : [
                  {
                    ...common,
                    id: 'qa-unit',
                    scope,
                    parentId: null,
                    name: '研发团队',
                    code: 'DEV',
                    sort: 0,
                    fullPath: '研发团队',
                    effective: true,
                    hasChildren: false,
                  },
                ],
            parentId: null,
            scope,
          })
        if (tail === '/positions')
          return reply(
            paged([
              {
                ...common,
                id: 'qa-position',
                scope,
                name: '开发工程师',
                code: 'DEV',
                memberCount: 1,
              },
            ]),
          )
        if (tail === '/organization/member-candidates') return reply(paged([candidate(scope)]))
        if (tail === '/organization/templates')
          return reply(
            paged([
              {
                ...common,
                id: 'qa-template',
                name: '项目协作模板',
                isDefault: true,
                unitCount: 1,
                positionCount: 1,
              },
            ]),
          )
        if (tail.startsWith('/organization/templates/'))
          return reply({
            ...common,
            id: 'qa-template',
            name: '项目协作模板',
            isDefault: true,
            units: [
              { ...common, id: 'qa-unit', parentId: null, name: '研发团队', code: 'DEV', sort: 0 },
            ],
            positions: [{ ...common, id: 'qa-position', name: '开发工程师', code: 'DEV' }],
          })
      }
      state.unexpected.push(`${method} ${path}`)
      return reply({ message: '未配置的验收接口' }, 501)
    },
  )
  return state
}

/** 使用明显虚构的候选记录验证回填和关系。 */
function candidate(scope) {
  return {
    ...user,
    userId: user.id,
    disabled: false,
    disabledReason: null,
    accountStatus: 'active',
    status: 'active',
    identities: [
      {
        scope,
        memberId: 'qa-member',
        memberStatus: 'active',
        scopeStatus: 'active',
        scopeName: scope.type === 'company' ? company.name : project.name,
        roles: [{ id: 'qa-role', name: '演示角色' }],
        effective: true,
        organizationUnits: [
          {
            id: 'qa-unit',
            membershipId: 'qa-membership',
            status: 'active',
            name: '研发团队',
            fullPath: '研发团队',
            effective: true,
            duty: 'member',
          },
        ],
        positions: [{ id: 'qa-position', name: '开发工程师', status: 'active' }],
      },
    ],
  }
}

/** 返回可编辑的虚构角色，并携带用于并发更新的版本。 */
function role(scope) {
  return {
    ...common,
    id: 'qa-role',
    scope,
    name: '演示角色',
    builtin: null,
    assignable: true,
    permissionKeys: [`${scope.type}.home.read`],
    memberCount: 1,
  }
}
