import type { OrganizationMemberCandidate, PositionRecord } from 'shared/types'
import type { positionsApi } from './api'

/** 分页读取当前作用域全部岗位，包含停用岗位以便保留既有任职。 */
export async function loadAllPositions(
  api: ReturnType<typeof positionsApi>,
): Promise<PositionRecord[]> {
  const first = await api.list({ page: 1, pageSize: 100 })
  const rest = await Promise.all(
    Array.from({ length: Math.ceil(first.total / 100) - 1 }, (_, index) =>
      api.list({ page: index + 2, pageSize: 100 }),
    ),
  )
  return [...first.items, ...rest.flatMap((page) => page.items)]
}

/** 分页读取指定岗位的完整成员候选，供任职成员编辑器回填。 */
export async function loadPositionMembers(
  api: ReturnType<typeof positionsApi>,
  positionId: string,
): Promise<OrganizationMemberCandidate[]> {
  const query = {
    purpose: 'assignPositionMembers' as const,
    positionIds: [positionId],
    includeDisabled: true,
    pageSize: 100,
  }
  const first = await api.memberCandidates({ ...query, page: 1 })
  const rest = await Promise.all(
    Array.from({ length: Math.ceil(first.total / 100) - 1 }, (_, index) =>
      api.memberCandidates({ ...query, page: index + 2 }),
    ),
  )
  return [...first.items, ...rest.flatMap((page) => page.items)]
}
