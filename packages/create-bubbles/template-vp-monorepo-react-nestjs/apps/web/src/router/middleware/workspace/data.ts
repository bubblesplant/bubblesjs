import type { AccessContext, AccessScope, ScopeType, WorkspacesResult } from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import { getAccessContext, getWorkspaces } from '@/pages/workspaces/api'
import { getWorkspaceState } from '@/pages/workspaces/state'
import { enterWorkspace } from '@/utils/request/workspace'

export const workspacesContext = createRouterContext<WorkspacesResult>()
export const scopeAccessContext = createRouterContext<AccessContext>()

/** 按本次导航获取最新入口列表，交给后续分流或工作空间选择页。 */
export const workspacesMiddleware: MiddlewareFunction = async ({ request, context }) => {
  enterWorkspace('workspaces')
  const state = getWorkspaceState()
  try {
    const workspaces = await getWorkspaces({ workspaceKey: 'workspaces', signal: request.signal })
    state.workspaces = workspaces
    context.set(workspacesContext, workspaces)
  } catch (error) {
    if ((error as Error).name !== 'AbortError') state.workspaces = undefined
    throw error
  }
}

/** 获取空间权限，交给布局展示及叶子 middleware 校验，共享一次权限请求。 */
export function scopeMiddleware(type: ScopeType): MiddlewareFunction {
  return /** 按作用域保存权限和名称；请求失败时清除旧权限，取消请求不影响新数据。 */ async ({
    params,
    request,
    context,
  }) => {
    const scope: AccessScope =
      type === 'platform'
        ? { type }
        : type === 'project'
          ? { type, companyId: params.companyId!, projectId: params.projectId! }
          : { type, companyId: params.companyId! }
    const key = accessScopeKey(scope)
    enterWorkspace(key)
    const state = getWorkspaceState()
    try {
      const [access, workspaces] = await Promise.all([
        getAccessContext(scope, { workspaceKey: key, signal: request.signal }),
        getWorkspaces({ workspaceKey: key, signal: request.signal }),
      ])
      state.accessByScope.set(key, {
        ...access,
        workspace: workspaces.workspaces.find((entry) => accessScopeKey(entry.scope) === key),
      })
      context.set(scopeAccessContext, access)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') state.accessByScope.delete(key)
      throw error
    }
  }
}
