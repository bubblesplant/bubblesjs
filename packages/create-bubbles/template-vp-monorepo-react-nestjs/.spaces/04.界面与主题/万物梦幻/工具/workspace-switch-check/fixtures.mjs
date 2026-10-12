import { fixtureResponse, user } from '../fixtures.mjs'

/** 虚构授权清单：包含仅有项目授权的企业，禁止请求真实后端。 */
export const workspaceEntries = [
  { scope: { type: 'platform' }, name: '平台管理', administrator: 'platform' },
  {
    scope: { type: 'company', companyId: 'qa-company' },
    name: '星屿科技',
    administrator: 'company',
  },
  { scope: { type: 'company', companyId: 'qa-company-2' }, name: '云间设计' },
  ...Array.from({ length: 6 }, (_, index) => ({
    scope: {
      type: 'project',
      companyId: 'qa-company',
      projectId: index === 0 ? 'qa-project' : `qa-project-${index + 1}`,
    },
    name:
      index === 0
        ? '月光计划'
        : index === 1
          ? '星屿协作 2 / Alpha Studio'
          : `星屿协作 ${index + 1}`,
    companyName: '星屿科技',
    ...(index === 0 ? { administrator: 'project' } : {}),
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    scope: {
      type: 'project',
      companyId: 'qa-company-2',
      projectId: `qa-cloud-${index + 1}`,
    },
    name: `云间项目 ${index + 1}`,
    companyName: '云间设计',
  })),
  {
    scope: { type: 'project', companyId: 'qa-project-only', projectId: 'qa-only-project' },
    name: '独立授权项目',
    companyName: '仅项目授权企业',
  },
]

/** 将所有名称替换为明显虚构的长文案，验证截断和所属企业展示。 */
export function withLongNames(entries) {
  const companyNames = new Map([
    ['qa-company', '虚构星屿科技企业拥有很长名称用于验证多语言和窄屏布局'],
    ['qa-company-2', 'Fictional Cloud Design International Enterprise Long Name'],
    ['qa-project-only', '仅项目授权的虚构企业包含很长名称用于验证筛选布局'],
  ])
  return entries.map((entry) => ({
    ...entry,
    name:
      entry.scope.type === 'company'
        ? companyNames.get(entry.scope.companyId)
        : `${entry.name} — Fictional Workspace With A Very Long Display Name`,
    ...(entry.companyName ? { companyName: companyNames.get(entry.scope.companyId) } : {}),
  }))
}

/** 创建可动态缩减清单和注入刷新失败的全量 mock；未配置请求立即失败。 */
export async function installFixtures({ context, baseUrl, entries, locale = 'zh_CN' }) {
  const state = { entries, failWorkspaces: false, requests: [], unexpected: [], logoutRequests: 0 }
  await context.addCookies([{ name: 'token', value: 'qa-only-noncredential', url: baseUrl }])
  await context.addInitScript(
    (value) => localStorage.setItem('wanwu-locale', JSON.stringify(value)),
    locale,
  )
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    state.requests.push(`${request.method()} ${url.pathname}`)
    if (url.pathname === '/api/workspaces') {
      if (state.failWorkspaces) {
        return route.fulfill({ status: 500, json: { message: '虚构刷新失败，请重试' } })
      }
      return route.fulfill({ status: 200, json: { user, workspaces: state.entries } })
    }
    if (url.pathname === '/api/auth/logout' && request.method() === 'POST') {
      state.logoutRequests += 1
      return route.fulfill({ status: 200, json: { loggedOut: true } })
    }
    const body = fixtureResponse(url, 'filled')
    if (request.method() !== 'GET' || body === undefined) {
      state.unexpected.push(`${request.method()} ${url.pathname}`)
      return route.fulfill({ status: 501, json: { message: '验证中未配置的 API' } })
    }
    return route.fulfill({ status: 200, json: body })
  })
  return state
}
