import type {
  AccessScope,
  AccountStatus,
  BuiltinRole,
  EntityStatus,
  UserSummary,
  VersionRequest,
} from './access'

export interface AccountRecord extends UserSummary {
  status: AccountStatus
  createdAt: string
  updatedAt: string
  platformRoleIds: string[]
}

export interface CompanyRecord {
  id: string
  name: string
  code: string
  description: string
  status: EntityStatus
  version: number
  createdAt: string
  updatedAt: string
}

export interface ProjectRecord extends CompanyRecord {
  companyId: string
}

export interface AdministratorSummary extends UserSummary {
  accountStatus: AccountStatus
  memberStatus: EntityStatus
  effective: boolean
}

export interface CompanyDetail extends CompanyRecord {
  administrators: AdministratorSummary[]
}

export interface ProjectDetail extends ProjectRecord {
  administrators: AdministratorSummary[]
}

export type ProjectAdministratorsResult = AdministratorSummary[]

export interface MemberRecord {
  id: string
  userId: string
  account: string
  name: string
  status: EntityStatus
  accountStatus: AccountStatus
  roleIds: string[]
  roleNames: string[]
  version: number
  createdAt: string
  updatedAt: string
}

export interface RoleRecord {
  id: string
  scope: AccessScope
  name: string
  description: string
  builtin: BuiltinRole
  permissionKeys: string[]
  version: number
  memberCount: number
  assignable: boolean
  createdAt: string
  updatedAt: string
}

export interface UpdateProfileRequest extends VersionRequest {
  name?: string
  code?: string
  description?: string
}

export interface SetAdministratorResult {
  administrator: AdministratorSummary
  replacedUserId: string | null
}

export interface AccountStatusRequest {
  status: EntityStatus
}

export interface AssignPlatformRolesRequest {
  roleIds: string[]
}

export interface AddMemberRequest {
  account: string
}

export interface AssignMemberRolesRequest extends VersionRequest {
  roleIds: string[]
}

export interface CreateRoleRequest {
  name: string
  description?: string
  permissionKeys?: string[]
}

export interface UpdateRoleRequest extends VersionRequest {
  name?: string
  description?: string
}

export interface SetRolePermissionsRequest extends VersionRequest {
  permissionKeys: string[]
}
