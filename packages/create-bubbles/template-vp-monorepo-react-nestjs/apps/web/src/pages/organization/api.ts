import type {
  CreateOrganizationUnitRequest,
  MoveOrganizationUnitRequest,
  OrganizationMemberCandidate,
  OrganizationMemberCandidateQuery,
  OrganizationScope,
  OrganizationTreeQuery,
  OrganizationTreeRecord,
  OrganizationUnitRecord,
  PageResult,
  ReplaceMemberOrganizationUnitsRequest,
  ReplaceMemberOrganizationUnitsResult,
  ReplaceOrganizationUnitMembersRequest,
  ReplaceOrganizationUnitMembersResult,
  ResolveOrganizationMemberCandidatesRequest,
  StatusRequest,
  UpdateOrganizationUnitRequest,
} from 'shared/types'
import { accessScopeBasePath, accessScopeKey } from 'shared/utils'
import {
  freshRequest,
  runWorkspaceRequest,
  workspaceRequest as http,
} from '@/utils/request/workspace'

/** 为企业或项目组织架构页绑定无缓存且可随工作空间切换取消的接口。 */
export function organizationApi(scope: OrganizationScope) {
  const base = accessScopeBasePath(scope)
  const workspaceKey = accessScopeKey(scope)
  const organizationBase = `${base}/organization`
  /** 发送组织架构查询并纳入工作空间代次取消。 */
  const get = <T>(url: string, params?: object, signal?: AbortSignal) =>
    runWorkspaceRequest({
      method: http.Get<T>(url, { ...freshRequest, params }),
      workspaceKey,
      signal,
    })
  /** 发送组织架构创建或动作请求。 */
  const post = <T>(url: string, data: object, signal?: AbortSignal) =>
    runWorkspaceRequest({ method: http.Post<T>(url, data, freshRequest), workspaceKey, signal })
  /** 发送组织架构局部更新请求。 */
  const patch = <T>(url: string, data: object) =>
    runWorkspaceRequest({ method: http.Patch<T>(url, data, freshRequest), workspaceKey })
  /** 发送组织关系全量替换请求。 */
  const put = <T>(url: string, data: object) =>
    runWorkspaceRequest({ method: http.Put<T>(url, data, freshRequest), workspaceKey })

  return {
    /** 按父节点懒加载一层组织单元。 */
    tree: (params: OrganizationTreeQuery = {}, signal?: AbortSignal) =>
      get<OrganizationTreeRecord>(`${organizationBase}/tree`, params, signal),
    /** 创建顶级或子级组织单元。 */
    createUnit: (data: CreateOrganizationUnitRequest) =>
      post<OrganizationUnitRecord>(`${organizationBase}/units`, data),
    /** 更新组织单元基本信息和排序。 */
    updateUnit: (id: string, data: UpdateOrganizationUnitRequest) =>
      patch<OrganizationUnitRecord>(`${organizationBase}/units/${id}`, data),
    /** 在同一作用域组织树中移动组织单元。 */
    moveUnit: (id: string, data: MoveOrganizationUnitRequest) =>
      post<OrganizationUnitRecord>(`${organizationBase}/units/${id}/move`, data),
    /** 停用或恢复组织单元，保留后代状态和成员关系。 */
    updateUnitStatus: (id: string, data: StatusRequest) =>
      patch<OrganizationUnitRecord>(`${organizationBase}/units/${id}/status`, data),
    /** 按 purpose 分页查询当前作用域成员候选。 */
    memberCandidates: (params: OrganizationMemberCandidateQuery, signal?: AbortSignal) =>
      get<PageResult<OrganizationMemberCandidate>>(
        `${organizationBase}/member-candidates`,
        params,
        signal,
      ),
    /** 按 userId 批量补查成员候选。 */
    resolveMemberCandidates: (
      data: ResolveOrganizationMemberCandidatesRequest,
      signal?: AbortSignal,
    ) =>
      post<OrganizationMemberCandidate[]>(
        `${organizationBase}/member-candidates/resolve`,
        data,
        signal,
      ),
    /** 按组织单元完整替换该单元成员及职责。 */
    replaceUnitMembers: (id: string, data: ReplaceOrganizationUnitMembersRequest) =>
      put<ReplaceOrganizationUnitMembersResult>(`${organizationBase}/units/${id}/members`, data),
    /** 按成员完整替换其在当前作用域的组织关系。 */
    replaceMemberUnits: (userId: string, data: ReplaceMemberOrganizationUnitsRequest) =>
      put<ReplaceMemberOrganizationUnitsResult>(
        `${organizationBase}/members/${userId}/units`,
        data,
      ),
  }
}
