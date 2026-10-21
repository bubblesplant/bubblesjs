import type { AccessContext, AccessScope, ScopeType, WorkspacesResult } from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import { getAccessContext } from '@/pages/workspaces/api'
import { useUserStore } from '@/store/user'
import { enterWorkspace } from '@/utils/request/workspace'

export const workspacesContext = createRouterContext<WorkspacesResult>()
export const scopeAccessContext = createRouterContext<AccessContext>()

/** 默认分流等待最新列表，选择页可先展示已核对归属的本地快照并后台更新。 */
export const workspacesMiddleware: MiddlewareFunction = async ({ request, context }) => {
  const { visitWorkspace, ensureWorkspaces } = useUserStore.getState()
  visitWorkspace('workspaces')
  enterWorkspace('workspaces')
  const workspaces = await ensureWorkspaces({
    signal: request.signal,
    allowRestored: new URL(request.url).pathname === '/workspaces',
  })
  context.set(workspacesContext, workspaces)
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
    const state = useUserStore.getState()
    state.visitWorkspace(key)
    enterWorkspace(key)
    try {
      const [access, workspaces] = await Promise.all([
        getAccessContext(scope, { workspaceKey: key, signal: request.signal }),
        state.ensureWorkspaces({ signal: request.signal }),
      ])
      state.setWorkspaceAccess(key, {
        ...access,
        workspace: workspaces.workspaces.find((entry) => accessScopeKey(entry.scope) === key),
      })
      context.set(scopeAccessContext, access)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') state.removeWorkspaceAccess(key)
      if ([403, 404].includes((error as { status?: number }).status ?? 0))
        state.invalidateWorkspaces()
      throw error
    }
  }
}
