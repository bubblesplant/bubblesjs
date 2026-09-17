import type {
  AccessScope,
  AccountStatus,
  BuiltinRole,
  EntityStatus,
  PageQuery,
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

export interface RegisterCompanyMemberRequest {
  name: string
  account: string
  password: string
}

export type CompanyMemberInvitationStatus = 'pending' | 'expired' | 'accepted' | 'revoked'

/** 企业成员邀请的可持久化公开信息；任何查询响应都不会包含 token 或 token 摘要。 */
export interface CompanyMemberInvitationRecord {
  id: string
  companyId: string
  status: CompanyMemberInvitationStatus
  createdByUserId: string
  acceptedByUserId: string | null
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface CompanyMemberInvitationQuery extends PageQuery {
  status?: CompanyMemberInvitationStatus
}

/** 创建不绑定具体账号的一次性企业邀请链接。 */
export type CreateCompanyMemberInvitationRequest = Record<string, never>

export type RevokeCompanyMemberInvitationRequest = VersionRequest

export type ResendCompanyMemberInvitationRequest = VersionRequest

/** 创建或重发时仅返回一次的原始 token，调用方负责组装并安全传递邀请链接。 */
export interface CompanyMemberInvitationIssueResult {
  invitation: CompanyMemberInvitationRecord
  token: string
}

export interface AcceptCompanyMemberInvitationRequest {
  token: string
}

export interface AcceptCompanyMemberInvitationResult {
  invitationId: string
  companyId: string
  companyName: string
  member: MemberRecord
}

export interface AddProjectMemberRequest {
  userId: string
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
