import {
  AuditOutlined,
  DashboardOutlined,
  ApartmentOutlined,
  IdcardOutlined,
  MenuOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
  SafetyOutlined,
  HomeOutlined,
  ProfileOutlined,
} from '@ant-design/icons'
import type { AccessContext, AccessScope, MenuNode } from 'shared/types'
import { accessRoutePath, filterSupportedAccessMenus } from 'shared/utils'
import { tr } from '@/i18n'

/** 此表随 Web 发布；服务端下发的 routeKey 不能动态 import 任意组件。 */
export const pageRegistry = {
  'platform.home': { path: '', title: () => tr('平台工作台') },
  'platform.companies': { path: 'companies', title: () => tr('企业管理') },
  'platform.accounts': { path: 'accounts', title: () => tr('全局账号') },
  'platform.roles': { path: 'roles', title: () => tr('平台角色') },
  'platform.menus': { path: 'menus', title: () => tr('菜单管理') },
  'platform.audit': { path: 'audit', title: () => tr('平台操作日志') },
  'company.home': { path: '', title: () => tr('企业工作台') },
  'company.profile': { path: 'profile', title: () => tr('企业资料') },
  'company.members': { path: 'members', title: () => tr('企业成员') },
  'company.roles': { path: 'roles', title: () => tr('企业角色') },
  'company.organization': { path: 'organization', title: () => tr('企业组织架构') },
  'company.positions': { path: 'positions', title: () => tr('企业岗位') },
  'company.organization.templates': {
    path: 'organization/templates',
    title: () => tr('项目组织模板'),
  },
  'company.projects': { path: 'projects', title: () => tr('项目管理') },
  'company.audit': { path: 'audit', title: () => tr('企业操作日志') },
  'project.home': { path: '', title: () => tr('项目工作台') },
  'project.profile': { path: 'profile', title: () => tr('项目资料') },
  'project.members': { path: 'members', title: () => tr('项目成员') },
  'project.roles': { path: 'roles', title: () => tr('项目角色') },
  'project.organization': { path: 'organization', title: () => tr('项目组织架构') },
  'project.positions': { path: 'positions', title: () => tr('项目岗位') },
  'project.audit': { path: 'audit', title: () => tr('项目操作日志') },
} as const

export type RegisteredPage = keyof typeof pageRegistry
export const registeredRouteKeys = Object.keys(pageRegistry)

/** 仅为前端已注册的页面生成指定作用域路径，未知页面返回 null。 */
export function pagePath(scope: AccessScope, routeKey: string) {
  const page = pageRegistry[routeKey as RegisteredPage]
  return page ? accessRoutePath({ scope, routeKey }) : null
}

/** 优先按可见菜单顺序寻找授权页面，再从已注册页面中兜底选择。 */
export function firstAccessiblePagePath(context: AccessContext): string | null {
  /** 仅为拥有读取权限的页面生成当前工作空间路径。 */
  const allowedPath = (key: string) =>
    context.permissionKeys.includes(`${key}.read`) ? pagePath(context.scope, key) : null
  /** 深度优先遍历可见且启用的菜单，返回首个已授权页面路径。 */
  const visit = (nodes: MenuNode[]): string | null => {
    for (const node of nodes) {
      if (node.hidden || node.status !== 'active' || node.type === 'operation') continue
      const destination =
        node.type === 'page' ? allowedPath(node.routeKey ?? '') : visit(node.children)
      if (destination) return destination
    }
    return null
  }
  return (
    visit(context.menus) ??
    registeredRouteKeys.map(allowedPath).find((destination) => destination !== null) ??
    null
  )
}

export const menuIcons = {
  DashboardOutlined: <DashboardOutlined />,
  ApartmentOutlined: <ApartmentOutlined />,
  ProjectOutlined: <ProjectOutlined />,
  TeamOutlined: <TeamOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />,
  MenuOutlined: <MenuOutlined />,
  AuditOutlined: <AuditOutlined />,
  IdcardOutlined: <IdcardOutlined />,
  UserOutlined: <UserOutlined />,
  SafetyOutlined: <SafetyOutlined />,
  HomeOutlined: <HomeOutlined />,
  ProfileOutlined: <ProfileOutlined />,
}

interface NavigationItem {
  key: string
  name: string
  path?: string
  icon: ReactNode
  routes?: NavigationItem[]
}

/** 过滤未发布和不可见功能，将有效菜单递归转换为布局导航数据。 */
export function navigationTree(nodes: MenuNode[], scope: AccessScope): NavigationItem[] {
  return filterSupportedAccessMenus({
    menus: nodes,
    supportedRouteKeys: registeredRouteKeys,
  }).flatMap(
    /** 丢弃不可导航节点，解析页面路径或递归生成目录下的有效导航项。 */ (
      node,
    ): NavigationItem[] => {
      if (node.hidden || node.status !== 'active' || node.type === 'operation') return []
      const icon = menuIcons[node.icon as keyof typeof menuIcons] ?? <ApartmentOutlined />
      if (node.type === 'page') {
        const path = pagePath(scope, node.routeKey ?? '')
        const page = pageRegistry[node.routeKey as RegisteredPage]
        return path ? [{ key: path, path, name: page?.title() ?? node.name, icon }] : []
      }
      const routes = navigationTree(node.children, scope)
      return routes.length ? [{ key: node.id, name: tr(node.name), icon, routes }] : []
    },
  )
}
