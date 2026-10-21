import type { AccessContext, AccessScope, CurrentUser, WorkspacesResult } from 'shared/types'
import { accessScopeBasePath } from 'shared/utils'
import {
  freshRequest,
  runSessionRequest,
  runWorkspaceRequest,
  workspaceRequest,
} from '@/utils/request/workspace'

interface WorkspaceApiRequestOptions {
  workspaceKey: string
  signal?: AbortSignal
}

/** 获取当前会话的空间列表，由全局 store 合并；切换空间不取消会话级请求。 */
export const getWorkspaces = ({ signal }: { signal?: AbortSignal }) =>
  runSessionRequest({
    method: workspaceRequest.Get<WorkspacesResult>('/workspaces', freshRequest),
    signal,
  })

/** 恢复本地展示快照前，使用现有身份接口核对账号归属，不缓存身份结果。 */
export const getWorkspaceUser = ({ signal }: { signal?: AbortSignal }) =>
  runSessionRequest({
    method: workspaceRequest.Get<CurrentUser>('/auth/me', freshRequest),
    signal,
  })

/** 获取指定工作空间的权限上下文，供路由进入校验使用。 */
export const getAccessContext = (
  scope: AccessScope,
  { workspaceKey, signal }: WorkspaceApiRequestOptions,
) =>
  runWorkspaceRequest({
    method: workspaceRequest.Get<AccessContext>(
      `${accessScopeBasePath(scope)}/access`,
      freshRequest,
    ),
    workspaceKey,
    signal,
    accessRequest: true,
  })
