import type { Router } from 'vue-router'

import NProgress from 'nprogress'

export function createPermissionGuard(router: Router) {
  router.beforeEach((_to, _from, next) => {
    NProgress.start()
    next()
  })
  router.afterEach((_to, _from) => {
    NProgress.done()
  })
}
