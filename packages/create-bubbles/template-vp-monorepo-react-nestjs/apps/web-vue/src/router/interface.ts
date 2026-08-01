import type { RouteRecordRaw } from 'vue-router'

export type MenuRouteRecordRawType = RouteRecordRaw & {
  meta?: {
    title?: string
    icon?: string
    hideInMenu?: boolean
  }
}
