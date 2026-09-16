import type {
  GlobalAccountCandidatePurpose,
  OrganizationMemberCandidatePurpose,
} from 'shared/types'
import type {
  GlobalAccountResolver,
  GlobalAccountSearchRequest,
  GlobalAccountSearchResult,
} from '@/components/Selector/GlobalAccountSelect'
import type {
  OrganizationMemberSearchRequest,
  OrganizationMemberSearchResult,
} from '@/components/Selector/OrganizationMemberSelector'
import type { managementApi } from '../../api'

type ManagementApi = ReturnType<typeof managementApi>

/** 创建绑定业务目的的全局账号搜索适配器，并把取消信号单独传给请求层。 */
export function createGlobalAccountSearch(
  api: ManagementApi,
  purpose: GlobalAccountCandidatePurpose,
): (input: GlobalAccountSearchRequest) => Promise<GlobalAccountSearchResult> {
  return async (input) => {
    const result = await api.globalAccountCandidates(
      { purpose, page: input.page, pageSize: input.pageSize, query: input.query },
      input.signal,
    )
    return { items: result.items, total: result.total }
  }
}

/** 创建绑定业务目的的全局账号补查适配器，确保回显与搜索使用同一权限语义。 */
export function createGlobalAccountResolver(
  api: ManagementApi,
  purpose: GlobalAccountCandidatePurpose,
): GlobalAccountResolver {
  return (userIds, signal) =>
    api.resolveGlobalAccountCandidates({ purpose, userIds: [...userIds] }, signal)
}

/** 创建绑定业务目的的组织成员搜索适配器，避免把 AbortSignal 序列化到查询参数。 */
export function createOrganizationMemberSearch(
  api: ManagementApi,
  purpose: OrganizationMemberCandidatePurpose,
): (input: OrganizationMemberSearchRequest) => Promise<OrganizationMemberSearchResult> {
  return async (input) => {
    const { signal, ...params } = input
    const result = await api.organizationMemberCandidates({ ...params, purpose }, signal)
    return { items: result.items, total: result.total }
  }
}

/** 创建按稳定 userId 补查组织成员候选的适配器。 */
export function createOrganizationMemberResolver(
  api: ManagementApi,
  purpose: OrganizationMemberCandidatePurpose,
) {
  return (userIds: string[]) => api.resolveOrganizationMemberCandidates({ userIds, purpose })
}
