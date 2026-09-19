import { describe, expect, it } from 'vite-plus/test'
import type { AccessContext, MenuNode } from 'shared/types'
import { ACCESS_PAGE_CATALOG } from 'shared/utils'
import { resolveSvgAsset, svgAssets } from '../src/components/Icon/SvgAsset'
import {
  firstAccessiblePagePath,
  navigationTree,
  pagePath,
} from '../src/router/page-registry'

/** 构造可覆盖字段的菜单节点，供导航和权限筛选用例复用。 */
function node(input: Partial<MenuNode>): MenuNode {
  return {
    id: 'node',
    scopeType: 'company',
    parentId: null,
    type: 'page',
    name: '页面',
    icon: '',
    sort: 0,
    hidden: false,
    status: 'active',
    routeKey: 'company.home',
    permissionKey: 'company.home.read',
    protected: false,
    children: [],
    ...input,
  }
}

describe('前端静态页面注册与菜单', () => {
  it('未知页面及其按钮和空目录不会进入菜单，来源数据不被修改', () => {
    const menus = [
      node({ id: 'known' }),
      node({
        id: 'directory',
        type: 'directory',
        routeKey: null,
        children: [
          node({
            id: 'future',
            routeKey: 'company.future',
            children: [node({ type: 'operation', routeKey: 'company.future' })],
          }),
        ],
      }),
    ]
    const before = JSON.stringify(menus)
    expect(
      navigationTree(menus, { type: 'company', companyId: 'a' }).map((item) => item.key),
    ).toEqual(['/companies/a'])
    expect(JSON.stringify(menus)).toBe(before)
  })

  it('隐藏或停用菜单不显示；隐藏页面已注册路径仍能被 loader 单独鉴权', () => {
    const scope = { type: 'company', companyId: 'a' } as const
    expect(
      navigationTree([node({ hidden: true }), node({ id: 'disabled', status: 'disabled' })], scope),
    ).toEqual([])
    expect(pagePath(scope, 'company.home')).toBe('/companies/a')
  })

  it('不为未知或跨作用域页面生成路径', () => {
    expect(pagePath({ type: 'platform' }, 'company.members')).toBeNull()
    expect(pagePath({ type: 'platform' }, 'platform.future')).toBeNull()
  })

  it('菜单目录图标均能解析为本地 SVG 资源', () => {
    for (const page of ACCESS_PAGE_CATALOG) {
      expect(resolveSvgAsset(page.icon).key).toBe(page.icon)
    }
    expect(svgAssets.map((asset) => asset.key)).toContain('menu-item')
    expect(resolveSvgAsset('').key).toBe('menu-item')
    expect(resolveSvgAsset('missing-icon').key).toBe('menu-item')
  })

  it('进入空间优先落在已授权的可见菜单，排除未知及跨作用域页面', () => {
    const context = {
      scope: { type: 'company', companyId: 'a' },
      permissionKeys: [
        'platform.menus.read',
        'company.future.read',
        'company.roles.read',
        'company.members.read',
      ],
      menus: [
        node({ routeKey: 'company.future' }),
        node({ routeKey: 'company.members', hidden: true }),
        node({ routeKey: 'company.roles' }),
      ],
    } as AccessContext
    expect(firstAccessiblePagePath(context)).toBe('/companies/a/roles')
    expect(firstAccessiblePagePath({ ...context, menus: [] })).toBe('/companies/a/members')
  })

  it('没有已授权静态页面时不生成工作空间落点', () => {
    expect(
      firstAccessiblePagePath({
        scope: { type: 'platform' },
        permissionKeys: ['platform.future.read', 'company.members.read'],
        menus: [],
      } as unknown as AccessContext),
    ).toBeNull()
  })
})
