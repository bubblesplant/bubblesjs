import type { OrganizationDuty, OrganizationMemberCandidate, OrganizationScope } from 'shared/types'
import { accessScopeKey } from 'shared/utils'

const dutyOrder: Record<OrganizationDuty, number> = {
  member: 0,
  deputy: 1,
  leader: 2,
}

interface CandidateAssignmentInput {
  candidate: OrganizationMemberCandidate
  scope: OrganizationScope
}

interface OrganizationAssignmentInput extends CandidateAssignmentInput {
  unitEffective: boolean
}

interface OrganizationDutyChangeInput extends OrganizationAssignmentInput {
  initialDuty?: OrganizationDuty
  nextDuty: OrganizationDuty
}

interface PositionAssignmentInput extends CandidateAssignmentInput {
  positionActive: boolean
}

/** 判断账号及其当前 URL 作用域成员身份是否都处于有效状态。 */
export function isCandidateActiveInScope({ candidate, scope }: CandidateAssignmentInput): boolean {
  if (candidate.accountStatus !== 'active') return false
  const scopeKey = accessScopeKey(scope)
  const identity = candidate.identities.find((item) => accessScopeKey(item.scope) === scopeKey)
  return identity?.scopeStatus === 'active' && identity.memberStatus === 'active'
}

/** 仅允许有效成员向有效组织单元新增关系。 */
export function canAddOrganizationAssignment({
  candidate,
  scope,
  unitEffective,
}: OrganizationAssignmentInput): boolean {
  return unitEffective && isCandidateActiveInScope({ candidate, scope })
}

/**
 * 有效关系可任意调整职责；失效关系只能原样保留或降级，不能新增或升级职责。
 */
export function canChangeOrganizationDuty({
  candidate,
  scope,
  unitEffective,
  initialDuty,
  nextDuty,
}: OrganizationDutyChangeInput): boolean {
  if (canAddOrganizationAssignment({ candidate, scope, unitEffective })) return true
  return initialDuty !== undefined && dutyOrder[nextDuty] <= dutyOrder[initialDuty]
}

/** 仅允许可选且当前作用域有效的成员新增到启用岗位。 */
export function canAddPositionAssignment({
  candidate,
  scope,
  positionActive,
}: PositionAssignmentInput): boolean {
  return positionActive && !candidate.disabled && isCandidateActiveInScope({ candidate, scope })
}
