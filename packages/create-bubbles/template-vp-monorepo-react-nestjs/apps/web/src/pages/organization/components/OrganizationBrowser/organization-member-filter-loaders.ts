import type {
  OrganizationMemberCandidate,
  OrganizationScope,
  OrganizationUnitRecord,
  PositionRecord,
  ProjectRecord,
  RoleRecord,
} from 'shared/types'
import type {
  OrganizationMemberBrowserFilters,
  OrganizationMemberFilterOption,
  OrganizationMemberResourceFilters,
} from '@/components/Selector/OrganizationMemberSelector'
import { managementApi } from '@/pages/access/api'
import { positionsApi } from '@/pages/positions/api'
import { loadAllPositions } from '@/pages/positions/loaders'
import { organizationApi } from '../../api'
import { loadAllOrganizationUnits, loadOrganizationUnitMembers } from './organization-loaders'

interface LoadOrganizationMemberDialogDataInput {
  api: ReturnType<typeof organizationApi>
  scope: OrganizationScope
  permissionKeys: readonly string[]
  unitId: string
}

interface ProjectFilterSource {
  id: string
  name: string
}

/** 分页读取角色或项目等管理资源，避免选择器只拿到第一页筛选项。 */
async function loadAllPages<T>(
  request: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const pageSize = 100
  const first = await request(1, pageSize)
  const rest = await Promise.all(
    Array.from({ length: Math.ceil(first.total / pageSize) - 1 }, (_, index) =>
      request(index + 2, pageSize),
    ),
  )
  return [...first.items, ...rest.flatMap((page) => page.items)]
}

/** 将当前作用域组织单元转换为可搜索的完整路径选项。 */
function organizationOptions(
  units: readonly OrganizationUnitRecord[],
  scopeName?: string,
): OrganizationMemberFilterOption[] {
  return units.map((unit) => ({
    value: unit.id,
    label: scopeName ? `${scopeName} / ${unit.fullPath}` : unit.fullPath,
  }))
}

/** 将当前作用域岗位转换为可搜索选项，并在跨项目时补充来源名称。 */
function positionOptions(
  positions: readonly PositionRecord[],
  scopeName?: string,
): OrganizationMemberFilterOption[] {
  return positions.map((position) => ({
    value: position.id,
    label: scopeName ? `${scopeName} / ${position.name}` : position.name,
  }))
}

/** 将权限角色转换为可搜索选项，并在跨项目时补充来源名称。 */
function roleOptions(
  roles: readonly RoleRecord[],
  scopeName?: string,
): OrganizationMemberFilterOption[] {
  return roles.map((role) => ({
    value: role.id,
    label: scopeName ? `${scopeName} / ${role.name}` : role.name,
  }))
}

/** 分页读取指定作用域全部权限角色。 */
function loadAllRoles(scope: OrganizationScope): Promise<RoleRecord[]> {
  const api = managementApi(scope)
  return loadAllPages((page, pageSize) => api.roles({ page, pageSize }))
}

/** 分页读取企业下全部项目，作为企业成员浏览器的可见项目入口。 */
function loadAllProjects(scope: Extract<OrganizationScope, { type: 'company' }>) {
  const api = managementApi(scope)
  return loadAllPages<ProjectRecord>((page, pageSize) => api.projects({ page, pageSize }))
}

/** 只把 403/404 视为该项目资源类别不可见，其余异常继续交给调用方处理。 */
function optionalVisibleResult<T>(result: PromiseSettledResult<T>): T | undefined {
  if (result.status === 'fulfilled') return result.value
  const status = (result.reason as { status?: number }).status
  if (status === 403 || status === 404) return undefined
  throw result.reason
}

/** 按项目实际权限并行读取组织、岗位和角色，缺少某类权限时不暴露该筛选项。 */
async function loadSingleProjectFilters(
  companyId: string,
  project: ProjectFilterSource,
): Promise<OrganizationMemberResourceFilters> {
  const scope: OrganizationScope = { type: 'project', companyId, projectId: project.id }
  const [unitsResult, positionsResult, rolesResult] = await Promise.allSettled([
    loadAllOrganizationUnits(organizationApi(scope)),
    loadAllPositions(positionsApi(scope)),
    loadAllRoles(scope),
  ])
  const units = optionalVisibleResult(unitsResult)
  const positions = optionalVisibleResult(positionsResult)
  const roles = optionalVisibleResult(rolesResult)
  return {
    ...(units
      ? { organizationUnits: organizationOptions(units, project.name), allowUnassigned: true }
      : {}),
    ...(positions ? { positions: positionOptions(positions, project.name) } : {}),
    ...(roles ? { roles: roleOptions(roles, project.name) } : {}),
  }
}

/** 创建企业成员浏览器的项目资源加载器，并合并多项目筛选项。 */
function createProjectFiltersLoader(
  companyId: string,
  projects: readonly ProjectFilterSource[],
): OrganizationMemberBrowserFilters['loadProjectFilters'] {
  const projectById = new Map(projects.map((project) => [project.id, project]))
  return async (projectIds) => {
    const selectedProjects = [...new Set(projectIds)]
      .map((projectId) => projectById.get(projectId))
      .filter((project): project is ProjectFilterSource => !!project)
    const filters = await Promise.all(
      selectedProjects.map((project) => loadSingleProjectFilters(companyId, project)),
    )
    const hasOrganizations = filters.some((item) => item.organizationUnits !== undefined)
    const hasPositions = filters.some((item) => item.positions !== undefined)
    const hasRoles = filters.some((item) => item.roles !== undefined)
    return {
      ...(hasOrganizations
        ? {
            organizationUnits: filters.flatMap((item) => item.organizationUnits ?? []),
            allowUnassigned: true,
          }
        : {}),
      ...(hasPositions ? { positions: filters.flatMap((item) => item.positions ?? []) } : {}),
      ...(hasRoles ? { roles: filters.flatMap((item) => item.roles ?? []) } : {}),
    }
  }
}

/** 加载组织成员弹窗所需的当前成员快照及全部获准筛选资源。 */
export async function loadOrganizationMemberDialogData({
  api,
  scope,
  permissionKeys,
  unitId,
}: LoadOrganizationMemberDialogDataInput): Promise<{
  selected: OrganizationMemberCandidate[]
  filters: OrganizationMemberBrowserFilters
}> {
  const positionPermission = `${scope.type}.positions.read`
  const rolePermission = `${scope.type}.roles.read`
  const canReadProjects =
    scope.type === 'company' && permissionKeys.includes('company.projects.read')
  const [selected, units, positions, roles, projects] = await Promise.all([
    loadOrganizationUnitMembers(api, unitId),
    loadAllOrganizationUnits(api),
    permissionKeys.includes(positionPermission) ? loadAllPositions(positionsApi(scope)) : undefined,
    permissionKeys.includes(rolePermission) ? loadAllRoles(scope) : undefined,
    canReadProjects ? loadAllProjects(scope) : undefined,
  ])
  return {
    selected,
    filters: {
      organizationUnits: organizationOptions(units),
      ...(positions ? { positions: positionOptions(positions) } : {}),
      ...(roles ? { roles: roleOptions(roles) } : {}),
      allowUnassigned: true,
      ...(projects
        ? {
            projects: projects.map((project) => ({ value: project.id, label: project.name })),
            loadProjectFilters: createProjectFiltersLoader(scope.companyId, projects),
          }
        : {}),
    },
  }
}
