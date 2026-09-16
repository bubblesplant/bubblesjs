import type {
  CreatePositionRequest,
  OrganizationMemberCandidate,
  OrganizationMemberCandidateQuery,
  OrganizationScope,
  PageResult,
  PositionListQuery,
  PositionRecord,
  ReplaceMemberPositionsRequest,
  ReplaceMemberPositionsResult,
  ReplacePositionMembersRequest,
  ReplacePositionMembersResult,
  ResolveOrganizationMemberCandidatesRequest,
  StatusRequest,
  UpdatePositionRequest,
} from 'shared/types'
import { accessScopeBasePath, accessScopeKey } from 'shared/utils'
import {
  freshRequest,
  runWorkspaceRequest,
  workspaceRequest as http,
} from '@/utils/request/workspace'

/** 为企业或项目岗位页绑定岗位、任职和候选接口。 */
export function positionsApi(scope: OrganizationScope) {
  const base = accessScopeBasePath(scope)
  const workspaceKey = accessScopeKey(scope)
  /** 发送岗位查询并纳入工作空间取消机制。 */
  const get = <T>(url: string, params?: object, signal?: AbortSignal) =>
    runWorkspaceRequest({
      method: http.Get<T>(url, { ...freshRequest, params }),
      workspaceKey,
      signal,
    })
  /** 发送岗位创建或候选补查请求。 */
  const post = <T>(url: string, data: object, signal?: AbortSignal) =>
    runWorkspaceRequest({ method: http.Post<T>(url, data, freshRequest), workspaceKey, signal })
  /** 发送岗位局部更新请求。 */
  const patch = <T>(url: string, data: object) =>
    runWorkspaceRequest({ method: http.Patch<T>(url, data, freshRequest), workspaceKey })
  /** 发送任职关系全量替换请求。 */
  const put = <T>(url: string, data: object) =>
    runWorkspaceRequest({ method: http.Put<T>(url, data, freshRequest), workspaceKey })

  return {
    /** 分页查询当前作用域岗位。 */
    list: (params: PositionListQuery = {}) =>
      get<PageResult<PositionRecord>>(`${base}/positions`, params),
    /** 创建当前作用域岗位。 */
    create: (data: CreatePositionRequest) => post<PositionRecord>(`${base}/positions`, data),
    /** 更新岗位名称、编码或说明。 */
    update: (id: string, data: UpdatePositionRequest) =>
      patch<PositionRecord>(`${base}/positions/${id}`, data),
    /** 停用或恢复岗位，保留既有任职。 */
    updateStatus: (id: string, data: StatusRequest) =>
      patch<PositionRecord>(`${base}/positions/${id}/status`, data),
    /** 查询岗位分配场景下的成员候选。 */
    memberCandidates: (params: OrganizationMemberCandidateQuery, signal?: AbortSignal) =>
      get<PageResult<OrganizationMemberCandidate>>(
        `${base}/organization/member-candidates`,
        params,
        signal,
      ),
    /** 按 userId 补查岗位成员候选。 */
    resolveMemberCandidates: (
      data: ResolveOrganizationMemberCandidatesRequest,
      signal?: AbortSignal,
    ) =>
      post<OrganizationMemberCandidate[]>(
        `${base}/organization/member-candidates/resolve`,
        data,
        signal,
      ),
    /** 按岗位完整替换该岗位任职成员。 */
    replacePositionMembers: (id: string, data: ReplacePositionMembersRequest) =>
      put<ReplacePositionMembersResult>(`${base}/positions/${id}/members`, data),
    /** 按成员完整替换其当前作用域岗位。 */
    replaceMemberPositions: (userId: string, data: ReplaceMemberPositionsRequest) =>
      put<ReplaceMemberPositionsResult>(`${base}/organization/members/${userId}/positions`, data),
  }
}
