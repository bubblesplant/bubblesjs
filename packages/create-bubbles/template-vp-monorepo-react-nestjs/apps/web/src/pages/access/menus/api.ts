import type {
  CleanupPreview,
  CleanupRequest,
  CleanupResult,
  CreateMenuRequest,
  FunctionCatalogResult,
  MenuTreeResult,
  ScopeType,
  UpdateMenuRequest,
} from 'shared/types'
import {
  freshRequest,
  runWorkspaceRequest,
  workspaceRequest as http,
} from '@/utils/request/workspace'

const workspaceKey = 'platform'

export const menuApi = {
  /** 读取指定作用域的菜单树及版本。 */
  tree: (scopeType: ScopeType) =>
    runWorkspaceRequest({
      method: http.Get<MenuTreeResult>('/platform/menus', {
        ...freshRequest,
        params: { scopeType },
      }),
      workspaceKey,
    }),
  /** 读取指定作用域已发布功能目录；图标由 Web 本地 SVG 注册表提供。 */
  catalog: (scopeType: ScopeType) =>
    runWorkspaceRequest({
      method: http.Get<FunctionCatalogResult>('/platform/function-catalog', {
        ...freshRequest,
        params: { scopeType },
      }),
      workspaceKey,
    }),
  /** 在指定作用域创建菜单节点，并返回最新菜单树。 */
  create: (scopeType: ScopeType, data: CreateMenuRequest) =>
    runWorkspaceRequest({
      method: http.Post<MenuTreeResult>('/platform/menus', data, {
        ...freshRequest,
        params: { scopeType },
      }),
      workspaceKey,
    }),
  /** 按预期版本更新菜单节点，返回最新菜单树。 */
  update: (id: string, data: UpdateMenuRequest) =>
    runWorkspaceRequest({
      method: http.Patch<MenuTreeResult>(`/platform/menus/${id}`, data, freshRequest),
      workspaceKey,
    }),
  /** 按预期版本删除菜单节点，返回最新菜单树。 */
  remove: (id: string, expectedVersion: number) =>
    runWorkspaceRequest({
      method: http.Delete<MenuTreeResult>(`/platform/menus/${id}`, undefined, {
        ...freshRequest,
        params: { expectedVersion },
      }),
      workspaceKey,
    }),
  /** 读取废弃权限清理范围、阻断原因和执行凭据。 */
  cleanupPreview: () =>
    runWorkspaceRequest({
      method: http.Get<CleanupPreview>('/platform/permissions/cleanup-preview', freshRequest),
      workspaceKey,
    }),
  /** 携带预览凭据执行废弃权限清理，返回处理结果。 */
  cleanup: (data: CleanupRequest) =>
    runWorkspaceRequest({
      method: http.Post<CleanupResult>('/platform/permissions/cleanup', data, freshRequest),
      workspaceKey,
    }),
}
