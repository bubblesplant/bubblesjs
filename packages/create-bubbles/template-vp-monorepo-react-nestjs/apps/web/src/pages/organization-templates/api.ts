import type {
  CreateOrganizationTemplateRequest,
  OrganizationTemplateListQuery,
  OrganizationTemplateRecord,
  OrganizationTemplateSummary,
  PageResult,
  ReplaceOrganizationTemplateRequest,
  UpdateOrganizationTemplateStatusRequest,
} from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import {
  freshRequest,
  runWorkspaceRequest,
  workspaceRequest as http,
} from '@/utils/request/workspace'

/** 为企业项目组织模板页绑定当前企业的模板聚合接口。 */
export function organizationTemplatesApi(companyId: string) {
  const base = `/companies/${companyId}/organization/templates`
  const workspaceKey = accessScopeKey({ type: 'company', companyId })
  /** 发送模板查询并纳入工作空间代次取消。 */
  const get = <T>(url: string, params?: object) =>
    runWorkspaceRequest({
      method: http.Get<T>(url, { ...freshRequest, params }),
      workspaceKey,
    })
  /** 发送模板创建请求。 */
  const post = <T>(url: string, data: object) =>
    runWorkspaceRequest({ method: http.Post<T>(url, data, freshRequest), workspaceKey })
  /** 发送模板整体替换请求。 */
  const put = <T>(url: string, data: object) =>
    runWorkspaceRequest({ method: http.Put<T>(url, data, freshRequest), workspaceKey })
  /** 发送模板状态或默认标记更新。 */
  const patch = <T>(url: string, data: object) =>
    runWorkspaceRequest({ method: http.Patch<T>(url, data, freshRequest), workspaceKey })

  return {
    /** 分页查询模板摘要，不加载完整树定义。 */
    list: (params: OrganizationTemplateListQuery = {}) =>
      get<PageResult<OrganizationTemplateSummary>>(base, params),
    /** 读取模板当前版本的完整组织与岗位定义。 */
    detail: (id: string) => get<OrganizationTemplateRecord>(`${base}/${id}`),
    /** 创建完整模板聚合。 */
    create: (data: CreateOrganizationTemplateRequest) =>
      post<OrganizationTemplateRecord>(base, data),
    /** 以乐观锁完整替换模板定义。 */
    replace: (id: string, data: ReplaceOrganizationTemplateRequest) =>
      put<OrganizationTemplateRecord>(`${base}/${id}`, data),
    /** 停用、恢复或设为默认模板。 */
    updateStatus: (id: string, data: UpdateOrganizationTemplateStatusRequest) =>
      patch<OrganizationTemplateRecord>(`${base}/${id}/status`, data),
  }
}
