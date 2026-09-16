import type { AccessScope, AccountStatus, EntityStatus, PageQuery, VersionRequest } from '../access'
import type { CompanyDetail, CompanyRecord, MemberRecord } from '../access-resources'

export type OrganizationScope = Extract<AccessScope, { type: 'company' | 'project' }>
export type CompanyEntityType = 'group' | 'company'
export type OrganizationDuty = 'member' | 'leader' | 'deputy'
export type ProjectOrganizationInitialization =
  | { mode: 'blank' }
  | { mode: 'template'; templateId: string; templateVersion: number }

export interface OrganizationRelationInput {
  organizationUnitId: string
  duty: OrganizationDuty
}

export interface CompanyHierarchyFields {
  parentCompanyId: string | null
  entityType: CompanyEntityType
  sort: number
}

export type CompanyHierarchyRecord = CompanyRecord & CompanyHierarchyFields
export type CompanyHierarchyDetail = CompanyDetail & CompanyHierarchyFields
export type CompanyHierarchyNode = CompanyHierarchyRecord & { children: CompanyHierarchyNode[] }

export interface UpdateCompanyHierarchyRequest extends VersionRequest {
  parentCompanyId: string | null
  entityType: CompanyEntityType
  sort?: number
}

export interface CreateCompanyRequest {
  name: string
  code: string
  description?: string
  administratorUserId: string
  parentCompanyId?: string | null
  entityType?: CompanyEntityType
  sort?: number
}

export interface CreateProjectRequest {
  name: string
  code: string
  description?: string
  administratorUserId: string
  organizationInitialization: ProjectOrganizationInitialization
}

export interface SetAdministratorRequest {
  administratorUserId: string
  replaceUserId?: string
}

export interface OrganizationTreeRecord {
  id: string
  scope: OrganizationScope
  parentId: string | null
  units: OrganizationUnitNode[]
}

export interface OrganizationTreeQuery {
  parentId?: string
}

export interface OrganizationUnitRecord {
  id: string
  treeId: string
  parentId: string | null
  name: string
  code: string
  description: string
  sort: number
  status: EntityStatus
  version: number
  depth: number
  fullPath: string
  createdAt: string
  updatedAt: string
}

export interface OrganizationUnitNode extends OrganizationUnitRecord {
  effective: boolean
  hasChildren: boolean
}

export interface CreateOrganizationUnitRequest {
  parentId?: string | null
  name: string
  code: string
  description?: string
  sort?: number
}

export interface UpdateOrganizationUnitRequest extends VersionRequest {
  name?: string
  code?: string
  description?: string
  sort?: number
}

export interface MoveOrganizationUnitRequest extends VersionRequest {
  parentId: string | null
  sort?: number
}

export interface OrganizationMembershipRecord {
  id: string
  organizationUnit: Pick<OrganizationUnitRecord, 'id' | 'name' | 'code' | 'fullPath' | 'status'>
  duty: OrganizationDuty
  createdAt: string
  updatedAt: string
}

export interface ReplaceMemberOrganizationUnitsRequest {
  relations: OrganizationRelationInput[]
}

export interface ReplaceMemberOrganizationUnitsResult {
  userId: string
  relations: OrganizationMembershipRecord[]
}

export interface OrganizationUnitMemberInput {
  userId: string
  duty: OrganizationDuty
}

export interface OrganizationUnitMemberRecord {
  membershipId: string
  member: Pick<MemberRecord, 'id' | 'userId' | 'account' | 'name' | 'status' | 'accountStatus'>
  duty: OrganizationDuty
  createdAt: string
  updatedAt: string
}

export interface ReplaceOrganizationUnitMembersRequest {
  members: OrganizationUnitMemberInput[]
}

export interface ReplaceOrganizationUnitMembersResult {
  organizationUnitId: string
  members: OrganizationUnitMemberRecord[]
}

export interface PositionRecord {
  id: string
  scope: OrganizationScope
  name: string
  code: string
  description: string
  status: EntityStatus
  version: number
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface PositionListQuery extends PageQuery {
  status?: EntityStatus
}

export interface CreatePositionRequest {
  name: string
  code: string
  description?: string
}

export interface UpdatePositionRequest extends VersionRequest {
  name?: string
  code?: string
  description?: string
}

export interface ReplaceMemberPositionsRequest {
  positionIds: string[]
}

export interface ReplaceMemberPositionsResult {
  userId: string
  positions: PositionRecord[]
}

export interface PositionMemberRecord {
  assignmentId: string
  member: Pick<MemberRecord, 'id' | 'userId' | 'account' | 'name' | 'status' | 'accountStatus'>
  createdAt: string
}

export interface ReplacePositionMembersRequest {
  userIds: string[]
}

export interface ReplacePositionMembersResult {
  positionId: string
  members: PositionMemberRecord[]
}

export interface OrganizationTemplateUnitInput {
  clientKey: string
  parentClientKey: string | null
  name: string
  code: string
  description?: string
  sort: number
}

export interface OrganizationTemplatePositionInput {
  name: string
  code: string
  description?: string
  status: EntityStatus
}

export interface OrganizationTemplateUnitRecord extends Omit<
  OrganizationTemplateUnitInput,
  'clientKey' | 'parentClientKey'
> {
  id: string
  parentId: string | null
  templateVersion: number
}

export interface OrganizationTemplatePositionRecord extends OrganizationTemplatePositionInput {
  id: string
  templateVersion: number
}

export interface OrganizationTemplateRecord {
  id: string
  companyId: string
  name: string
  description: string
  status: EntityStatus
  isDefault: boolean
  version: number
  units: OrganizationTemplateUnitRecord[]
  positions: OrganizationTemplatePositionRecord[]
  createdAt: string
  updatedAt: string
}

export interface OrganizationTemplateSummary extends Omit<
  OrganizationTemplateRecord,
  'units' | 'positions'
> {
  unitCount: number
  positionCount: number
}

export interface OrganizationTemplateListQuery extends PageQuery {
  status?: EntityStatus
}

export interface CreateOrganizationTemplateRequest {
  name: string
  description?: string
  isDefault?: boolean
  units: OrganizationTemplateUnitInput[]
  positions: OrganizationTemplatePositionInput[]
}

export interface ReplaceOrganizationTemplateRequest extends VersionRequest {
  name: string
  description?: string
  isDefault: boolean
  units: OrganizationTemplateUnitInput[]
  positions: OrganizationTemplatePositionInput[]
}

export interface UpdateOrganizationTemplateStatusRequest extends VersionRequest {
  status?: EntityStatus
  isDefault?: boolean
}

export type GlobalAccountCandidatePurpose = 'createCompanyAdministrator' | 'setCompanyAdministrator'
export type OrganizationMemberCandidatePurpose =
  | 'browseOrganization'
  | 'assignPositionMembers'
  | 'createProjectAdministrator'
  | 'setProjectAdministrator'
export type CandidateDisabledReason =
  | 'accountInactive'
  | 'memberInactive'
  | 'scopeInactive'
  | 'organizationInactive'
  | 'positionInactive'
  | null

export interface GlobalAccountCandidateQuery extends PageQuery {
  purpose: GlobalAccountCandidatePurpose
}

export interface GlobalAccountCandidate {
  userId: string
  account: string
  name: string
  status: AccountStatus
  disabled: boolean
  disabledReason: CandidateDisabledReason
}

export interface OrganizationMemberCandidateQuery extends PageQuery {
  purpose?: OrganizationMemberCandidatePurpose
  organizationUnitIds?: string[]
  positionIds?: string[]
  roleIds?: string[]
  projectIds?: string[]
  unassigned?: boolean
  includeDisabled?: boolean
}

export interface OrganizationUnitCandidateTag {
  id: string
  membershipId: string
  name: string
  fullPath: string
  status: EntityStatus
  effective: boolean
  duty: OrganizationDuty
}

export interface PositionCandidateTag {
  id: string
  name: string
  status: EntityStatus
}

export interface OrganizationMemberIdentity {
  scope: OrganizationScope
  scopeName: string
  memberId: string
  memberStatus: EntityStatus
  scopeStatus: EntityStatus
  organizationUnits: OrganizationUnitCandidateTag[]
  positions: PositionCandidateTag[]
  roles: Array<{ id: string; name: string }>
}

export interface OrganizationMemberCandidate {
  userId: string
  account: string
  name: string
  accountStatus: AccountStatus
  identities: OrganizationMemberIdentity[]
  disabled: boolean
  disabledReason: CandidateDisabledReason
}

export interface ResolveCandidatesRequest {
  userIds: string[]
}

export interface ResolveGlobalAccountCandidatesRequest extends ResolveCandidatesRequest {
  purpose: GlobalAccountCandidatePurpose
}

export interface ResolveOrganizationMemberCandidatesRequest extends ResolveCandidatesRequest {
  purpose?: OrganizationMemberCandidatePurpose
}
