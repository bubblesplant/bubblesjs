import type {
  AccessScope,
  CreateDictionaryRequest,
  DictionaryListQuery,
  DictionaryOption,
  DictionaryRecord,
  DictionaryReference,
  PageResult,
  UpdateDictionaryRequest,
} from 'shared/types'
import { accessScopeBasePath, accessScopeKey } from 'shared/utils'
import {
  freshRequest,
  refreshAccess,
  runSessionRequest,
  runWorkspaceRequest,
  workspaceRequest as http,
} from '@/utils/request/workspace'

/** 仅发送选项 HTTP 请求；缓存和同键合并统一由字典 store 处理。 */
export async function fetchDictionaryItems(
  input: DictionaryReference & { signal?: AbortSignal },
): Promise<DictionaryOption[]> {
  const { scope, code, signal } = input
  const params =
    scope.type === 'platform'
      ? { scopeType: scope.type, code }
      : scope.type === 'company'
        ? { scopeType: scope.type, companyId: scope.companyId, code }
        : { scopeType: scope.type, companyId: scope.companyId, projectId: scope.projectId, code }
  try {
    return await runSessionRequest({
      method: http.Get<DictionaryOption[]>('/dictionary-options', { ...freshRequest, params }),
      signal,
    })
  } catch (error) {
    if ((error as { status?: number }).status === 403) refreshAccess()
    throw error
  }
}

/** 管理接口绑定创建时的工作空间，切换后旧请求失效。 */
export function dictionaryApi(scope: AccessScope) {
  const base = `${accessScopeBasePath(scope)}/dictionaries`
  const workspaceKey = accessScopeKey(scope)
  return {
    /** 分页读取当前归属配置，不使用 HTTP 或 alova 缓存。 */
    list: (params: DictionaryListQuery) =>
      runWorkspaceRequest({
        method: http.Get<PageResult<DictionaryRecord>>(base, { ...freshRequest, params }),
        workspaceKey,
      }),
    /** 提交当前归属的新字典。 */
    create: (body: CreateDictionaryRequest) =>
      runWorkspaceRequest({
        method: http.Post<DictionaryRecord>(base, body, freshRequest),
        workspaceKey,
      }),
    /** 提交完整编辑内容与预期版本，由服务端保护历史业务值。 */
    update: (id: string, body: UpdateDictionaryRequest) =>
      runWorkspaceRequest({
        method: http.Patch<DictionaryRecord>(
          `${base}/${encodeURIComponent(id)}`,
          body,
          freshRequest,
        ),
        workspaceKey,
      }),
  }
}
