import { describe, expect, it } from 'vite-plus/test'
import type { MenuNode, ScopeType } from '../src/types'
import {
  ACCESS_BUILTIN_MEMBER_PERMISSIONS,
  ACCESS_ICON_KEY_PATTERN,
  ACCESS_PAGE_CATALOG,
  ACCESS_PERMISSION_CATALOG,
  ACCESS_PROTECTED_ROUTE_KEYS,
  accessRoutePath,
  accessScopeBasePath,
  accessScopeKey,
  filterSupportedAccessMenus,
  getAccessPermission,
  getBuiltinPermissionKeys,
} from '../src/utils'

describe('共享权限目录约束', () => {
  it('每个页面和操作都有唯一且同作用域的有效绑定', () => {
    expect(new Set(ACCESS_PAGE_CATALOG.map((page) => page.routeKey)).size).toBe(
      ACCESS_PAGE_CATALOG.length,
    )
    expect(new Set(ACCESS_PERMISSION_CATALOG.map((permission) => permission.key)).size).toBe(
      ACCESS_PERMISSION_CATALOG.length,
    )

    for (const page of ACCESS_PAGE_CATALOG) {
      expect(ACCESS_ICON_KEY_PATTERN.test(page.icon)).toBe(true)
      expect(getAccessPermission(page.permissionKey)).toMatchObject({
        kind: 'page',
        scopeType: page.scopeType,
        routeKey: page.routeKey,
      })
      for (const key of page.operationKeys) {
        expect(getAccessPermission(key)).toMatchObject({
          kind: 'operation',
          scopeType: page.scopeType,
          routeKey: page.routeKey,
          pagePermissionKey: page.permissionKey,
        })
      }
    }

    for (const permission of ACCESS_PERMISSION_CATALOG) {
      if (permission.kind === 'operation') {
        expect(getAccessPermission(permission.pagePermissionKey!)).toMatchObject({
          kind: 'page',
          scopeType: permission.scopeType,
          routeKey: permission.routeKey,
        })
      }
    }
  })

  it('管理员专属操作准确隔离，默认成员不获得管理操作', () => {
    expect(
      ACCESS_PERMISSION_CATALOG.filter((permission) => permission.adminOnly)
        .map((permission) => permission.key)
        .sort(),
    ).toEqual([
      'company.projects.administrator',
      'company.projects.create',
      'platform.companies.administrator',
      'platform.companies.create',
      'platform.menus.cleanup',
    ])
    for (const scopeType of ['platform', 'company', 'project'] satisfies ScopeType[]) {
      const memberKeys = getBuiltinPermissionKeys({ scopeType, builtin: 'member' })
      expect(memberKeys).toEqual(ACCESS_BUILTIN_MEMBER_PERMISSIONS[scopeType])
      for (const key of memberKeys)
        expect(getAccessPermission(key)).toMatchObject({
          kind: 'page',
          scopeType,
          adminOnly: false,
        })
      expect(getBuiltinPermissionKeys({ scopeType, builtin: 'administrator' })).toEqual(
        ACCESS_PERMISSION_CATALOG.filter(
          (permission) => permission.scopeType === scopeType && !permission.deprecated,
        ).map((permission) => permission.key),
      )
    }
  })

  it('恢复管理涉及的四个页面均受到保护', () => {
    for (const routeKey of [
      'platform.companies',
      'platform.accounts',
      'platform.roles',
      'platform.menus',
    ]) {
      expect(ACCESS_PROTECTED_ROUTE_KEYS).toContain(routeKey)
      expect(ACCESS_PAGE_CATALOG.some((page) => page.routeKey === routeKey)).toBe(true)
    }
  })
})

describe('作用域路径', () => {
  it('不同企业下相同项目 ID 不会共享作用域标识', () => {
    const first = { type: 'project', companyId: 'company-a', projectId: 'project-a' } as const
    const second = { ...first, companyId: 'company-b' }
    expect(accessScopeKey(first)).not.toBe(accessScopeKey(second))
    expect(accessScopeBasePath(first)).toBe('/companies/company-a/projects/project-a')
    expect(accessRoutePath({ scope: first, routeKey: 'project.members' })).toBe(
      '/companies/company-a/projects/project-a/members',
    )
  })

  it('拒绝不匹配或未知 routeKey，并转义路径参数', () => {
    const scope = { type: 'company', companyId: 'company/a' } as const
    expect(accessScopeBasePath(scope)).toBe('/companies/company%2Fa')
    expect(accessRoutePath({ scope, routeKey: 'company.profile' })).toBe(
      '/companies/company%2Fa/profile',
    )
    expect(accessRoutePath({ scope, routeKey: 'project.profile' })).toBeNull()
    expect(accessRoutePath({ scope, routeKey: 'company.future' })).toBeNull()
  })
})

function menuNode(overrides: Partial<MenuNode>): MenuNode {
  return {
    id: 'directory',
    scopeType: 'company',
    parentId: null,
    type: 'directory',
    name: '目录',
    icon: '',
    sort: 0,
    hidden: false,
    status: 'active',
    routeKey: null,
    permissionKey: null,
    protected: false,
    children: [],
    ...overrides,
  }
}

describe('旧前端菜单过滤', () => {
  it('过滤未知页面及其按钮、移除空目录，并保留已知页面及源数据', () => {
    const operation = menuNode({
      id: 'operation',
      parentId: 'known',
      type: 'operation',
      routeKey: 'company.members',
      permissionKey: 'company.members.add',
    })
    const known = menuNode({
      id: 'known',
      parentId: 'mixed',
      type: 'page',
      routeKey: 'company.members',
      permissionKey: 'company.members.read',
      children: [operation],
    })
    const unknown = menuNode({
      id: 'unknown',
      type: 'page',
      routeKey: 'company.future',
      permissionKey: 'company.future.read',
      children: [
        menuNode({ id: 'future-operation', type: 'operation', routeKey: 'company.future' }),
      ],
    })
    const menus = [
      menuNode({ id: 'mixed', children: [known, unknown] }),
      menuNode({ id: 'empty-after-filter', children: [unknown] }),
    ]
    const result = filterSupportedAccessMenus({
      menus,
      supportedRouteKeys: new Set(['company.members']),
    })

    expect(result.map((node) => node.id)).toEqual(['mixed'])
    expect(result[0]?.children.map((node) => node.id)).toEqual(['known'])
    expect(result[0]?.children[0]?.children.map((node) => node.id)).toEqual(['operation'])
    expect(menus[0]?.children).toHaveLength(2)
    expect(menus[1]?.children).toHaveLength(1)
    expect(result[0]).not.toBe(menus[0])
    expect(result[0]?.children[0]).not.toBe(known)
  })

  it('已知页面没有操作按钮也不会被当成空目录移除', () => {
    const home = menuNode({
      id: 'home',
      type: 'page',
      routeKey: 'company.home',
      permissionKey: 'company.home.read',
    })
    expect(
      filterSupportedAccessMenus({ menus: [home], supportedRouteKeys: ['company.home'] }).map(
        (node) => node.id,
      ),
    ).toEqual(['home'])
  })
})
