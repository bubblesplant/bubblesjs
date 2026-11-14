import type { RouteRecordRaw } from 'vue-router'
import { supportedPages } from '../access'

const components: Record<string, RouteRecordRaw['component']> = {
  home: () => import('@/views/access/home/index.vue'),
  companies: () => import('@/views/access/entities/index.vue'),
  projects: () => import('@/views/access/entities/index.vue'),
  accounts: () => import('@/views/access/members/index.vue'),
  members: () => import('@/views/access/members/index.vue'),
  roles: () => import('@/views/access/roles/index.vue'),
  profile: () => import('@/views/access/profile/index.vue'),
  audit: () => import('@/views/access/audit/index.vue'),
  menus: () => import('@/views/access/menus/index.vue'),
  dictionaries: () => import('@/views/dictionaries/index.vue'),
  organization: () => import('@/views/organization/index.vue'),
  positions: () => import('@/views/positions/index.vue'),
  templates: () => import('@/views/organization-templates/index.vue'),
}
export const menuRoutes: RouteRecordRaw[] = supportedPages.map((page) => ({
  path: page.path,
  name: page.routeKey,
  meta: { title: page.title, routeKey: page.routeKey, scopeType: page.scopeType },
  component: components[page.routeKey.split('.').at(-1)!]!,
}))
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    meta: { public: true, title: '登录' },
    component: () => import('@/views/login/index.vue'),
  },
  {
    path: '/register',
    meta: { public: true, title: '注册' },
    component: () => import('@/views/register/index.vue'),
  },
  {
    path: '/workspaces',
    meta: { title: '选择工作空间' },
    component: () => import('@/views/workspaces/index.vue'),
  },
  {
    path: '/',
    component: () => import('@/layout/default/index.vue'),
    children: [
      {
        path: '',
        component: () => import('@/views/workspaces/index.vue'),
      },
      {
        path: '/home',
        component: () => import('@/views/workspaces/index.vue'),
      },
      ...menuRoutes,
      {
        path: '/examples/pro-table',
        meta: { public: true, title: 'ProTable 示例' },
        component: () => import('@/views/examples/pro-table/index.vue'),
      },
      {
        path: '/examples/pro-table/draft',
        meta: { public: true, title: '草稿编辑表格' },
        component: () => import('@/views/examples/pro-table/index.vue'),
      },
      {
        path: '/examples/i18n',
        meta: { public: true, title: '国际化示例' },
        component: () => import('@/views/examples/i18n/index.vue'),
      },
      {
        path: '/examples/selector',
        meta: { public: true, title: '选择器示例' },
        component: () => import('@/views/examples/selector/index.vue'),
      },
    ],
  },
  {
    path: '/403',
    meta: { public: true, title: '无权访问' },
    component: () => import('@/views/result/index.vue'),
  },
  {
    path: '/error',
    meta: { public: true, title: '加载失败' },
    component: () => import('@/views/result/index.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    meta: { public: true, title: '页面不存在' },
    component: () => import('@/views/result/index.vue'),
  },
]
