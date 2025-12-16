import type { RouteRecordRaw } from 'vue-router'

import type { MenuRouteRecordRawType } from '../interface'

import { ExampleRoutes } from './example'

export const menuRoutes: MenuRouteRecordRawType [] = [
  {
    path: '/home',
    name: 'Home',
    meta: { title: '首页概览', icon: 'svg-home' },
    component: () => import('@/views/home/index.vue'),
  },
]

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'layout',
    component: () => import('@/layout/default/index.vue'),
    children: [
      {
        path: '/',
        redirect: '/home',
      },
      ...menuRoutes,
    ],
  },
  ...ExampleRoutes,
  {
    path: '/login',
    name: 'login',
    meta: { title: '登录' },
    component: () => import('@/views/login/index.vue'),
  },
]
