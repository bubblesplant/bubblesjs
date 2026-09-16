import { getBuiltinPermissionKeys } from 'shared/utils'
import { getAccessContext } from '@/pages/workspaces/api'
import { firstAccessiblePagePath } from '@/router/page-registry'
import { workspacesContext } from './data'

const companyMemberPermissions = new Set(
  getBuiltinPermissionKeys({ scopeType: 'company', builtin: 'member' }),
)

/** 只用于默认入口；主动选择空间和具体页面链接不执行自动选项目。 */
export const entryMiddleware: MiddlewareFunction = async ({ request, context }) => {
  const data = context.get(workspacesContext)
  const projects = data.workspaces.filter((entry) => entry.scope.type === 'project')
  const project = projects[0]
  if (
    projects.length !== 1 ||
    !project ||
    data.workspaces.some(
      (entry) => entry.scope.type === 'platform' || entry.administrator === 'company',
    )
  ) {
    throw redirect('/workspaces')
  }

  let destination: string | null = null
  try {
    // 默认企业成员也有企业入口；额外的企业授权才表示需要保留的企业职责。
    const companyAccess = await Promise.all(
      data.workspaces
        .filter((entry) => entry.scope.type === 'company')
        .map((entry) =>
          getAccessContext(entry.scope, { workspaceKey: 'workspaces', signal: request.signal }),
        ),
    )
    const hasCompanyResponsibilities = companyAccess.some(
      (access) =>
        access.administrator === 'company' ||
        access.permissionKeys.some((key) => !companyMemberPermissions.has(key)),
    )
    if (!hasCompanyResponsibilities) {
      const access = await getAccessContext(project.scope, {
        workspaceKey: 'workspaces',
        signal: request.signal,
      })
      destination = firstAccessiblePagePath(access)
    }
  } catch (error) {
    // 列表获取后若身份恰好被撤销，回选择页重新取最新列表，避免自动进入失效项目。
    if (![403, 404].includes((error as { status?: number }).status ?? 0)) throw error
  }
  throw redirect(destination ?? '/workspaces')
}
