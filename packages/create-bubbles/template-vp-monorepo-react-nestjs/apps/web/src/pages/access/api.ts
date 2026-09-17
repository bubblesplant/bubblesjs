import type {
  AccessScope,
  AccountRecord,
  AccountStatusRequest,
  AddProjectMemberRequest,
  AdministratorSummary,
  AssignMemberRolesRequest,
  AssignPlatformRolesRequest,
  AuditQuery,
  AuditRecord,
  CompanyMemberInvitationIssueResult,
  CompanyMemberInvitationQuery,
  CompanyMemberInvitationRecord,
  CompanyDetail,
  CompanyHierarchyDetail,
  CompanyHierarchyNode,
  CompanyHierarchyRecord,
  CompanyRecord,
  CreateCompanyRequest,
  CreateProjectRequest,
  CreateRoleRequest,
  DeleteResult,
  EntityStatus,
  GlobalAccountCandidate,
  GlobalAccountCandidateQuery,
  MemberRecord,
  OrganizationMemberCandidate,
  OrganizationMemberCandidateQuery,
  OrganizationTemplateListQuery,
  OrganizationTemplateSummary,
  PageQuery,
  PageResult,
  PermissionTreeResult,
  ProjectDetail,
  ProjectRecord,
  RegisterCompanyMemberRequest,
  ResendCompanyMemberInvitationRequest,
  RevokeCompanyMemberInvitationRequest,
  RoleRecord,
  ResolveGlobalAccountCandidatesRequest,
  ResolveOrganizationMemberCandidatesRequest,
  SetAdministratorRequest,
  SetAdministratorResult,
  SetRolePermissionsRequest,
  StatusRequest,
  UpdateProfileRequest,
  UpdateRoleRequest,
  UpdateCompanyHierarchyRequest,
} from 'shared/types'
import { accessScopeBasePath, accessScopeKey } from 'shared/utils'
import {
  freshRequest,
  runWorkspaceRequest,
  workspaceRequest as http,
} from '@/utils/request/workspace'

/** 为指定工作空间绑定管理接口，统一使用禁用缓存且可取消的请求。 */
export function managementApi(scope: AccessScope) {
  const base = accessScopeBasePath(scope)
  const workspaceKey = accessScopeKey(scope)
  /** 发送当前工作空间的无缓存查询，并将请求纳入会话取消控制。 */
  const get = <T>(url: string, params?: object, signal?: AbortSignal) =>
    runWorkspaceRequest({
      method: http.Get<T>(url, { ...freshRequest, params }),
      workspaceKey,
      signal,
    })
  /** 发送当前工作空间的创建或动作请求，并纳入会话取消控制。 */
  const post = <T>(url: string, data: object, signal?: AbortSignal) =>
    runWorkspaceRequest({ method: http.Post<T>(url, data, freshRequest), workspaceKey, signal })
  /** 发送当前工作空间的局部更新请求，并纳入会话取消控制。 */
  const patch = <T>(url: string, data: object) =>
    runWorkspaceRequest({ method: http.Patch<T>(url, data, freshRequest), workspaceKey })
  /** 发送当前工作空间的整体更新请求，并纳入会话取消控制。 */
  const put = <T>(url: string, data: object) =>
    runWorkspaceRequest({ method: http.Put<T>(url, data, freshRequest), workspaceKey })
  /** 将预期版本加入删除参数，避免删除并发变更后的数据。 */
  const remove = (url: string, expectedVersion: number) =>
    runWorkspaceRequest({
      method: http.Delete<DeleteResult>(url, undefined, {
        ...freshRequest,
        params: { expectedVersion },
      }),
      workspaceKey,
    })
  const entities = scope.type === 'platform' ? '/platform/companies' : `${base}/projects`

  return {
    /** 分页查询平台下的企业，支持按状态筛选。 */
    companies: (params: PageQuery & { status?: EntityStatus }) =>
      get<PageResult<CompanyRecord>>(entities, params),
    /** 分页查询当前企业下的项目，支持按状态筛选。 */
    projects: (params: PageQuery & { status?: EntityStatus }) =>
      get<PageResult<ProjectRecord>>(entities, params),
    /** 创建企业并返回包含管理员信息的企业详情。 */
    createCompany: (data: CreateCompanyRequest) => post<CompanyHierarchyDetail>(entities, data),
    /** 在当前企业下创建项目并返回项目详情。 */
    createProject: (data: CreateProjectRequest) => post<ProjectDetail>(entities, data),
    /** 读取企业详情及管理员信息。 */
    companyDetail: (id: string) => get<CompanyDetail>(`${entities}/${id}`),
    /** 读取指定项目的管理员列表。 */
    projectAdministrators: (id: string) =>
      get<AdministratorSummary[]>(`${entities}/${id}/administrators`),
    /** 携带版本条件更新企业或项目的启用状态。 */
    entityStatus: (id: string, data: StatusRequest) =>
      patch<CompanyRecord | ProjectRecord>(`${entities}/${id}/status`, data),
    /** 为指定企业或项目补充或替换管理员。 */
    setAdministrator: (id: string, data: SetAdministratorRequest) =>
      post<SetAdministratorResult>(`${entities}/${id}/administrator`, data),
    /** 查询平台全局账号候选；purpose 由服务端映射到对应企业管理权限。 */
    globalAccountCandidates: (params: GlobalAccountCandidateQuery, signal?: AbortSignal) =>
      get<PageResult<GlobalAccountCandidate>>('/platform/account-candidates', params, signal),
    /** 按 userId 批量补查全局账号候选并保持请求顺序。 */
    resolveGlobalAccountCandidates: (
      data: ResolveGlobalAccountCandidatesRequest,
      signal?: AbortSignal,
    ) => post<GlobalAccountCandidate[]>('/platform/account-candidates/resolve', data, signal),
    /** 查询当前企业或项目可见的组织成员候选。 */
    organizationMemberCandidates: (
      params: OrganizationMemberCandidateQuery,
      signal?: AbortSignal,
    ) =>
      get<PageResult<OrganizationMemberCandidate>>(
        `${base}/organization/member-candidates`,
        params,
        signal,
      ),
    /** 按 userId 批量补查当前作用域的组织成员候选。 */
    resolveOrganizationMemberCandidates: (
      data: ResolveOrganizationMemberCandidatesRequest,
      signal?: AbortSignal,
    ) =>
      post<OrganizationMemberCandidate[]>(
        `${base}/organization/member-candidates/resolve`,
        data,
        signal,
      ),
    /** 查询企业可用的项目组织模板摘要。 */
    organizationTemplates: (params: OrganizationTemplateListQuery = {}) =>
      get<PageResult<OrganizationTemplateSummary>>(`${base}/organization/templates`, params),
    /** 查询平台可见企业层级树。 */
    companyTree: () => get<CompanyHierarchyNode[]>('/platform/companies/tree'),
    /** 更新企业父级、实体类型和同级排序。 */
    updateCompanyHierarchy: (id: string, data: UpdateCompanyHierarchyRequest) =>
      patch<CompanyHierarchyRecord>(`/platform/companies/${id}/hierarchy`, data),
    /** 读取当前工作空间的企业或项目资料。 */
    profile: () => get<CompanyDetail | ProjectDetail>(base),
    /** 携带版本条件更新当前企业或项目资料。 */
    updateProfile: (data: UpdateProfileRequest) => patch<CompanyRecord | ProjectRecord>(base, data),
    /** 分页查询当前工作空间成员，支持按成员状态筛选。 */
    members: (params: PageQuery & { status?: EntityStatus }) =>
      get<PageResult<MemberRecord>>(`${base}/members`, params),
    /** 直接注册新账号并加入当前企业。 */
    registerCompanyMember: (data: RegisterCompanyMemberRequest) =>
      post<MemberRecord>(`${base}/members`, data),
    /** 分页读取当前企业的一次性成员邀请，不返回原始 token。 */
    companyMemberInvitations: (params: CompanyMemberInvitationQuery) =>
      get<PageResult<CompanyMemberInvitationRecord>>(`${base}/member-invitations`, params),
    /** 创建不绑定账号的一次性企业邀请，原始 token 仅在本次响应返回。 */
    createCompanyMemberInvitation: () =>
      post<CompanyMemberInvitationIssueResult>(`${base}/member-invitations`, {}),
    /** 携带当前版本撤销尚未接受的企业成员邀请。 */
    revokeCompanyMemberInvitation: (
      invitationId: string,
      data: RevokeCompanyMemberInvitationRequest,
    ) =>
      post<CompanyMemberInvitationRecord>(
        `${base}/member-invitations/${invitationId}/revoke`,
        data,
      ),
    /** 使旧凭证失效并签发新的企业邀请 token，原始 token 仅在本次响应返回。 */
    resendCompanyMemberInvitation: (
      invitationId: string,
      data: ResendCompanyMemberInvitationRequest,
    ) =>
      post<CompanyMemberInvitationIssueResult>(
        `${base}/member-invitations/${invitationId}/resend`,
        data,
      ),
    /** 按稳定 userId 将所属企业的有效成员加入当前项目。 */
    addProjectMember: (data: AddProjectMemberRequest) =>
      post<MemberRecord>(`${base}/members`, data),
    /** 携带版本条件更新指定成员的启用状态。 */
    memberStatus: (id: string, data: StatusRequest) =>
      patch<MemberRecord>(`${base}/members/${id}/status`, data),
    /** 按预期版本移除工作空间成员。 */
    removeMember: (id: string, expectedVersion: number) =>
      remove(`${base}/members/${id}`, expectedVersion),
    /** 替换工作空间成员的角色分配。 */
    memberRoles: (id: string, data: AssignMemberRolesRequest) =>
      put<MemberRecord>(`${base}/members/${id}/roles`, data),
    /** 分页查询平台全局账号，支持按账号状态筛选。 */
    accounts: (params: PageQuery & { status?: string }) =>
      get<PageResult<AccountRecord>>('/platform/accounts', params),
    /** 携带版本条件更新全局账号状态。 */
    accountStatus: (id: string, data: AccountStatusRequest) =>
      patch<AccountRecord>(`/platform/accounts/${id}/status`, data),
    /** 替换全局账号在平台范围内的角色分配。 */
    accountRoles: (id: string, data: AssignPlatformRolesRequest) =>
      put<AccountRecord>(`/platform/accounts/${id}/roles`, data),
    /** 分页读取当前工作空间的角色列表。 */
    roles: (params: PageQuery = {}) => get<PageResult<RoleRecord>>(`${base}/roles`, params),
    /** 读取指定角色的详情及权限配置。 */
    role: (id: string) => get<RoleRecord>(`${base}/roles/${id}`),
    /** 在当前工作空间创建自定义角色。 */
    createRole: (data: CreateRoleRequest) => post<RoleRecord>(`${base}/roles`, data),
    /** 携带版本条件更新指定角色资料。 */
    updateRole: (id: string, data: UpdateRoleRequest) =>
      patch<RoleRecord>(`${base}/roles/${id}`, data),
    /** 携带版本条件替换角色的权限集合。 */
    rolePermissions: (id: string, data: SetRolePermissionsRequest) =>
      put<RoleRecord>(`${base}/roles/${id}/permissions`, data),
    /** 按预期版本删除自定义角色。 */
    deleteRole: (id: string, expectedVersion: number) =>
      remove(`${base}/roles/${id}`, expectedVersion),
    /** 获取当前作用域的权限目录及当前用户可授予的权限。 */
    permissions: () => get<PermissionTreeResult>(`${base}/permissions`),
    /** 按查询条件分页读取当前工作空间的审计日志。 */
    audits: (params: AuditQuery) => get<PageResult<AuditRecord>>(`${base}/audit-logs`, params),
  }
}
