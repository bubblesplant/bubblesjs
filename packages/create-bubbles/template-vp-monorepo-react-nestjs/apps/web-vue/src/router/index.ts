import type { App } from 'vue'

import { createRouter, createWebHistory } from 'vue-router'

import { setupGuard } from './guard'
import { routes } from './modules'

export const router = createRouter({
  history: createWebHistory(import.meta.env.PUBLIC_PATH),
  routes,
  strict: true,
  scrollBehavior: () => ({ left: 0, top: 0 }),
})

export function setupRouter(app: App) {
  setupGuard(router)
  app.use(router)
}
