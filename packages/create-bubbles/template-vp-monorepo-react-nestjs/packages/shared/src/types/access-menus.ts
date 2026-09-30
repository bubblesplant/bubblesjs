import type { AccessScope, EntityStatus, ScopeType, UserSummary, VersionRequest } from './access'

export type MenuNodeType = 'directory' | 'page' | 'operation'

export interface MenuNode {
  id: string
  scopeType: ScopeType
  parentId: string | null
  type: MenuNodeType
  name: string
  icon: string
  sort: number
  hidden: boolean
  status: EntityStatus
  routeKey: string | null
  permissionKey: string | null
  protected: boolean
  children: MenuNode[]
}

export interface AccessContext {
  user: UserSummary
  scope: AccessScope
  administrator: ScopeType | null
  permissionKeys: string[]
  menus: MenuNode[]
  menuVersion: number
  catalogVersion: string
}

export interface MenuTreeResult {
  scopeType: ScopeType
  version: number
  items: MenuNode[]
}

export interface PermissionDefinition {
  key: string
  scopeType: ScopeType
  kind: 'page' | 'operation'
  title: string
  routeKey: string
  pagePermissionKey: string | null
  adminOnly: boolean
  deprecated: boolean
}

export interface PermissionTreeResult {
  catalogVersion: string
  items: MenuNode[]
  permissions: PermissionDefinition[]
  grantablePermissionKeys: string[]
}

export interface AccessPageDefinition {
  scopeType: ScopeType
  routeKey: string
  path: string
  title: string
  permissionKey: string
  icon: string
  operationKeys: string[]
}

export interface CreateMenuRequest extends VersionRequest {
  parentId: string | null
  type: MenuNodeType
  name: string
  icon?: string
  sort?: number
  hidden?: boolean
  status?: EntityStatus
  routeKey?: string
  permissionKey?: string
}

export interface UpdateMenuRequest extends VersionRequest {
  parentId?: string | null
  name?: string
  icon?: string
  sort?: number
  hidden?: boolean
  status?: EntityStatus
}

export interface FunctionCatalogResult {
  catalogVersion: string
  items: PermissionDefinition[]
}

export interface FilterSupportedAccessMenusInput {
  menus: readonly MenuNode[]
  supportedRouteKeys: Iterable<string>
}
