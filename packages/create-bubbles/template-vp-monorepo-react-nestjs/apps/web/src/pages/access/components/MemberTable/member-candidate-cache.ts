import type { OrganizationMemberCandidate } from 'shared/types'

/** 不改变原 Map 地删除指定成员候选；不存在该键时复用原引用。 */
export function removeMemberCandidate(
  candidates: Map<string, OrganizationMemberCandidate>,
  userId: string,
): Map<string, OrganizationMemberCandidate> {
  if (!candidates.has(userId)) return candidates
  const next = new Map(candidates)
  next.delete(userId)
  return next
}
