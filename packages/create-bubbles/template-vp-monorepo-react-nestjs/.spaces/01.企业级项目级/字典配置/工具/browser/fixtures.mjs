import { randomUUID } from 'node:crypto'

export const companyId = '11111111-1111-4111-8111-111111111111'
export const projectId = '22222222-2222-4222-8222-222222222222'
export const scopes = [
  { type: 'platform' },
  { type: 'company', companyId },
  { type: 'project', companyId, projectId },
]
const user = {
  id: '33333333-3333-4333-8333-333333333333',
  name: '字典测试用户',
  account: 'dictionary_qa',
}
const workspaces = scopes.map((scope) => ({
  scope,
  name: `测试${scope.type}空间`,
  administrator: scope.type,
  ...(scope.type === 'project' ? { companyName: '测试企业' } : {}),
}))

/** 从真实归属生成工作空间 URL，与应用使用相同的层级。 */
export function base(scope) {
  return scope.type === 'platform'
    ? '/platform'
    : scope.type === 'company'
      ? `/companies/${scope.companyId}`
      : `/companies/${scope.companyId}/projects/${scope.projectId}`
}

/** 将共享权限目录转换为虚构授权上下文，保持菜单与实现一致。 */
function access({ scope, catalog }) {
  return {
    user,
    scope,
    administrator: scope.type,
    permissionKeys: catalog.ACCESS_PERMISSION_CATALOG.filter(
      (item) => item.scopeType === scope.type,
    ).map((item) => item.key),
    menus: catalog.ACCESS_PAGE_CATALOG.filter((item) => item.scopeType === scope.type).map(
      (item, sort) => ({
        id: randomUUID(),
        scopeType: scope.type,
        parentId: null,
        type: 'page',
        name: item.title,
        icon: item.icon,
        sort,
        hidden: false,
        status: 'active',
        routeKey: item.routeKey,
        permissionKey: item.permissionKey,
        protected: false,
        children: [],
      }),
    ),
    menuVersion: 1,
    catalogVersion: catalog.ACCESS_CATALOG_VERSION,
  }
}

/** 所有业务 HTTP 都由虚构数据响应，浏览器验收不写入真实账号或业务数据。 */
export async function install({ context, baseUrl, catalog }) {
  const state = { unexpected: [], optionRequests: [], writes: [], records: new Map() }
  for (const scope of scopes)
    state.records.set(scope.type, [
      {
        id: randomUUID(),
        scope,
        code: 'units',
        name: `${scope.type}计量单位`,
        description: '虚构验收数据',
        status: 'active',
        items: [{ value: 'm', label: '米', sort: 0, status: 'active' }],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
  await context.addCookies([{ name: 'token', value: 'dictionary-test-session', url: baseUrl }])
  await context.addInitScript(() => localStorage.setItem('wanwu-locale', JSON.stringify('zh_CN')))
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace(/^\/api/, '')
      const reply = (json, status = 200) => route.fulfill({ status, json })
      if (path === '/workspaces') return reply({ user, workspaces })
      if (path === '/auth/me') return reply(user)
      if (path === '/dictionary-options') {
        state.optionRequests.push(url.search)
        const record = state.records
          .get(url.searchParams.get('scopeType'))
          .find((item) => item.code === url.searchParams.get('code'))
        return reply(
          record.items
            .filter((item) => item.status === 'active')
            .map(({ label, value }) => ({ label, value })),
        )
      }
      for (const scope of scopes) {
        const root = base(scope)
        if (path === `${root}/access`) return reply(access({ scope, catalog }))
        if (path === `${root}/dictionaries` && request.method() === 'GET') {
          const query = url.searchParams.get('query') || ''
          const status = url.searchParams.get('status')
          const items = state.records
            .get(scope.type)
            .filter(
              (item) =>
                `${item.name}${item.code}`.includes(query) && (!status || item.status === status),
            )
          return reply({ items, total: items.length, page: 1, pageSize: 20 })
        }
        if (path === `${root}/dictionaries` && request.method() === 'POST') {
          const body = request.postDataJSON()
          const record = {
            ...body,
            id: randomUUID(),
            scope,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          state.writes.push({ method: 'POST', scope: scope.type, body })
          state.records.get(scope.type).unshift(record)
          return reply(record, 201)
        }
        if (path.startsWith(`${root}/dictionaries/`) && request.method() === 'PATCH') {
          const record = state.records
            .get(scope.type)
            .find((item) => item.id === path.split('/').at(-1))
          const body = request.postDataJSON()
          if (body.expectedVersion !== record.version)
            return reply({ code: 'ACCESS.VERSION_CONFLICT', message: '版本冲突' }, 409)
          state.writes.push({ method: 'PATCH', scope: scope.type, body })
          Object.assign(record, body, {
            version: record.version + 1,
            updatedAt: new Date().toISOString(),
          })
          delete record.expectedVersion
          return reply(record)
        }
      }
      state.unexpected.push(`${request.method()} ${path}`)
      return reply({ code: 'TEST.UNEXPECTED', message: '未配置的验收请求' }, 501)
    },
  )
  return state
}
