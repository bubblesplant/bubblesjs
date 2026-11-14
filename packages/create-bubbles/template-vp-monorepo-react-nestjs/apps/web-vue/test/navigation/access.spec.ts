import type { AccessContext, MenuNode } from 'shared/types'
import { ACCESS_PAGE_CATALOG } from 'shared/utils'
import { describe, expect, it } from 'vite-plus/test'
import { firstAccessiblePath, navigationMenus, routeScope, supportedPages } from '@/router/access'
import { menuRoutes } from '@/router/modules'
import { buildAuthPath, safeNextPath } from '@/utils/safe-next'

/** 用最小菜单结构测试过滤和导航，所有名称均为虚构数据。 */
function menu(id: string, overrides: Partial<MenuNode> = {}): MenuNode {
  return {
    id,
    name: id,
    type: 'page',
    routeKey: 'platform.home',
    status: 'active',
    hidden: false,
    children: [],
    ...overrides,
  } as MenuNode
}
/** 返回平台权限快照，避免测试依赖真实账号。 */
function context(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    scope: { type: 'platform' },
    permissionKeys: ['platform.home.read'],
    menus: [],
    ...overrides,
  } as AccessContext
}
describe('安全导航', () => {
  it.each(['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '', null])(
    '拒绝外部地址 %s',
    (value) => {
      expect(safeNextPath(value)).toBe('/')
    },
  )
  it('保留站内查询与片段并编码认证参数', () => {
    expect(safeNextPath('/companies/demo?tab=members#row')).toBe('/companies/demo?tab=members#row')
    expect(buildAuthPath('/login', { next: '//evil.test', registered: true })).toBe(
      '/login?registered=1',
    )
    expect(
      new URL(
        buildAuthPath('/login', { next: '/platform?tab=1' }),
        'https://demo.test',
      ).searchParams.get('next'),
    ).toBe('/platform?tab=1')
  })
})
describe('管理页面注册与权限', () => {
  it('全部 25 个已发布页面均有组件、标题和作用域', () => {
    expect(supportedPages).toHaveLength(25)
    expect(supportedPages.map((page) => page.routeKey).sort()).toEqual(
      ACCESS_PAGE_CATALOG.map((page) => page.routeKey).sort(),
    )
    expect(menuRoutes).toHaveLength(25)
    for (const page of supportedPages) {
      const route = menuRoutes.find((route) => route.name === page.routeKey)!
      expect(route.path).toBe(page.path)
      expect(typeof route.component).toBe('function')
      expect(route.meta?.title).toBe(page.title)
      expect(route.meta?.scopeType).toBe(page.scopeType)
    }
  })
  it('从项目 URL 参数生成空间，不复用历史空间', () => {
    expect(
      routeScope({
        meta: { scopeType: 'project' },
        params: { companyId: 'demo-c', projectId: 'demo-p' },
      }),
    ).toEqual({ type: 'project', companyId: 'demo-c', projectId: 'demo-p' })
    expect(routeScope({ meta: {}, params: {} })).toBeNull()
  })
  it('过滤隐藏、停用、操作、未知页面及未授权菜单', () => {
    const visible = menu('visible')
    const access = context({
      menus: [
        menu('hidden', { hidden: true }),
        menu('disabled', { status: 'disabled' }),
        menu('operation', { type: 'operation' }),
        menu('unknown', { routeKey: 'platform.unknown' }),
        menu('unauthorized', { routeKey: 'platform.roles' }),
        menu('directory', { type: 'directory', routeKey: null, children: [visible] }),
      ],
    })
    expect(navigationMenus(access).map((node) => node.id)).toEqual(['directory'])
    expect(navigationMenus(access)[0]!.children.map((node) => node.id)).toEqual(['visible'])
  })
  it('首页无权限时按授权目录兜底，无任何页面时返回空', () => {
    expect(firstAccessiblePath(context({ permissionKeys: ['platform.roles.read'] }))).toBe(
      '/platform/roles',
    )
    expect(firstAccessiblePath(context({ permissionKeys: [] }))).toBeNull()
  })
})
