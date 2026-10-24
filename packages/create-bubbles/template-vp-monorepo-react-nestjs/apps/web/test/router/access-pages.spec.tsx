import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { MenuNode, ScopeType } from 'shared/types'
import { ACCESS_PAGE_CATALOG } from 'shared/utils'

const factories = vi.hoisted(() => ({
  lazyLoad: vi.fn<(moduleName: string, leafPath?: string) => ReactElement>(),
  accessMiddleware: vi.fn<(routeKey: string) => MiddlewareFunction>(),
}))

vi.mock('@/router/lazy-load', () => ({ lazyLoad: factories.lazyLoad }))
vi.mock('@/router/middleware', () => ({ accessMiddleware: factories.accessMiddleware }))
vi.mock('@/i18n', () => ({ tr: (value: string) => value }))

import RouteError from '../../src/pages/error/error'
import { pageComponents, type AccessPageComponent } from '../../src/router/access-pages/bindings'
import {
  firstAccessiblePagePath,
  pageRegistry,
  registeredRouteKeys,
} from '../../src/router/access-pages/registry'
import { accessScopeRoutePath, createAccessRoutes } from '../../src/router/access-pages/routes'

const scopeTypes: ScopeType[] = ['platform', 'company', 'project']

beforeEach(() => {
  vi.clearAllMocks()
  factories.lazyLoad.mockImplementation((moduleName, leafPath) => (
    <span data-page-module={moduleName} data-leaf-path={leafPath ?? 'index'} />
  ))
  factories.accessMiddleware.mockImplementation(() => async () => {})
})

afterEach(() => {
  vi.doUnmock('@/router/access-pages/bindings')
  vi.resetModules()
})

describe('共享目录派生生产页面路由', () => {
  it.each([
    ['platform', '/platform'],
    ['company', '/companies/:companyId'],
    ['project', '/companies/:companyId/projects/:projectId'],
  ] as const)('%s 从首页派生根路径并只生成一个默认首页', (scopeType, path) => {
    expect(accessScopeRoutePath(scopeType)).toBe(path)
    const routes = createAccessRoutes(scopeType)
    expect(routes.filter((route) => route.index)).toHaveLength(1)
    expect(routes[0]).toMatchObject({ id: `${scopeType}.home`, index: true })
    expect(routes[0]).not.toHaveProperty('path')
    expect(routes.find((route) => route.id === `${scopeType}.dictionaries`)).toMatchObject({
      path: 'dictionaries',
    })
  })

  it.each(scopeTypes)('%s 的全部页面保持已发布顺序、懒加载绑定和权限错误边界', (scopeType) => {
    const routes = createAccessRoutes(scopeType)
    const bindings = Object.entries(pageComponents).filter(([routeKey]) =>
      ACCESS_PAGE_CATALOG.some(
        (page) => page.routeKey === routeKey && page.scopeType === scopeType,
      ),
    )
    expect(routes.map((route) => route.id)).toEqual(bindings.map(([routeKey]) => routeKey))
    expect(factories.lazyLoad).toHaveBeenCalledTimes(bindings.length)
    expect(factories.accessMiddleware).toHaveBeenCalledTimes(bindings.length)
    for (const [index, [routeKey, binding]] of bindings.entries()) {
      const { moduleName, leafPath } = binding as AccessPageComponent
      expect(factories.lazyLoad).toHaveBeenNthCalledWith(index + 1, moduleName, leafPath)
      expect(factories.accessMiddleware).toHaveBeenNthCalledWith(index + 1, routeKey)
      expect(routes[index]?.element).toBe(factories.lazyLoad.mock.results[index]?.value)
      expect(routes[index]?.middleware).toEqual([
        factories.accessMiddleware.mock.results[index]?.value,
      ])
      expect(routes[index]?.errorElement).toMatchObject({ type: RouteError })
    }
  })

  it('本地组件均来自共享目录；已发布路径与实际相对路由一致，嵌套页面不丢失层级', () => {
    const routes = scopeTypes.flatMap((scopeType) =>
      createAccessRoutes(scopeType).map((route) => ({ scopeType, route })),
    )
    const localRouteKeys = Object.keys(pageComponents)
    expect(routes).toHaveLength(localRouteKeys.length)
    expect(new Set(registeredRouteKeys)).toEqual(new Set(localRouteKeys))
    expect(new Set(routes.map(({ route }) => route.id))).toEqual(new Set(localRouteKeys))
    expect(registeredRouteKeys).toEqual(
      expect.arrayContaining([
        'company.organization.templates',
        'project.organization',
        'project.positions',
      ]),
    )
    for (const routeKey of localRouteKeys) {
      expect(ACCESS_PAGE_CATALOG.find((page) => page.routeKey === routeKey)).toBeDefined()
    }
    for (const { scopeType, route } of routes) {
      const page = ACCESS_PAGE_CATALOG.find((item) => item.routeKey === route.id)
      const path = accessScopeRoutePath(scopeType) + (route.path ? `/${route.path}` : '')
      expect(page?.path).toBe(path)
      expect(page?.scopeType).toBe(scopeType)
    }
    expect(
      createAccessRoutes('company').find((route) => route.id === 'company.organization.templates'),
    ).toMatchObject({ path: 'organization/templates' })
  })

  it('可见菜单缺失时继续优先选择原有顺序中的字典页面', () => {
    for (const scopeType of scopeTypes) {
      const routeKeys = createAccessRoutes(scopeType).map((route) => route.id)
      expect(routeKeys.indexOf(`${scopeType}.home`)).toBeLessThan(
        routeKeys.indexOf(`${scopeType}.dictionaries`),
      )
      expect(routeKeys.indexOf(`${scopeType}.dictionaries`)).toBeLessThan(
        routeKeys.indexOf(`${scopeType}.roles`),
      )
      const scope =
        scopeType === 'platform'
          ? { type: scopeType }
          : scopeType === 'company'
            ? { type: scopeType, companyId: 'company-a' }
            : { type: scopeType, companyId: 'company-a', projectId: 'project-a' }
      expect(
        firstAccessiblePagePath({
          user: { id: 'user', name: '测试用户', account: 'member' },
          scope,
          administrator: null,
          permissionKeys: [`${scopeType}.dictionaries.read`, `${scopeType}.roles.read`],
          menus: [],
          menuVersion: 1,
          catalogVersion: 'test',
        }),
      ).toBe(
        scopeType === 'platform'
          ? '/platform/dictionaries'
          : scopeType === 'company'
            ? '/companies/company-a/dictionaries'
            : '/companies/company-a/projects/project-a/dictionaries',
      )
    }
  })

  it('组件绑定不存在于共享页面目录时立即报告非法 routeKey', async () => {
    vi.resetModules()
    vi.doMock('@/router/access-pages/bindings', () => ({
      pageComponents: { 'platform.future': { moduleName: 'missing-page' } },
    }))
    await expect(import('../../src/router/access-pages/registry')).rejects.toThrow(
      'platform.future',
    )
  })

  it('共享目录中尚未随当前 Web 发布的页面不会进入路径、菜单或路由', async () => {
    vi.resetModules()
    vi.doMock('@/router/access-pages/bindings', () => ({
      pageComponents: { 'company.home': { moduleName: 'access', leafPath: 'home' } },
    }))
    const registry = await import('../../src/router/access-pages/registry')
    const routes = await import('../../src/router/access-pages/routes')
    expect(registry.registeredRouteKeys).toEqual(['company.home'])
    expect(registry.pagePath({ type: 'company', companyId: 'a' }, 'company.members')).toBeNull()
    const menu: MenuNode = {
      id: 'unpublished',
      scopeType: 'company',
      parentId: null,
      type: 'page',
      name: '企业成员',
      icon: '',
      sort: 0,
      hidden: false,
      status: 'active',
      routeKey: 'company.members',
      permissionKey: 'company.members.read',
      protected: false,
      children: [],
    }
    expect(registry.navigationTree([menu], { type: 'company', companyId: 'a' })).toEqual([])
    expect(routes.createAccessRoutes('company').map((route) => route.id)).toEqual(['company.home'])
    expect(pageRegistry['company.members']).toBeDefined()
  })
})
