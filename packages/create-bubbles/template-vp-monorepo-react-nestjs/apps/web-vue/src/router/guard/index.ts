import type { Router } from 'vue-router'

import { createPermissionGuard } from './permissionGuard'

export function setupGuard(router: Router) {
  createPermissionGuard(router)
}
