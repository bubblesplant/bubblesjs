import type { Router } from 'vue-router'

import { createRouteTransition } from '../transition'
import { createPermissionGuard } from './permissionGuard'

/** 为路由实例注册应用级导航守卫。 */
export function setupGuard(router: Router) {
  createRouteTransition(router)
  createPermissionGuard(router)
}
