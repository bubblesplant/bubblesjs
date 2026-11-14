import type { OrganizationDuty, OrganizationMemberCandidate, OrganizationScope } from '../../types'
import { accessScopeKey } from '../access-scope'

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

const dutyOrder: Record<OrganizationDuty, number> = { member: 0, deputy: 1, leader: 2 }

/** 判断账号及当前作用域的成员身份是否均处于有效状态。 */
export function isCandidateActiveInScope({ candidate, scope }: CandidateAssignmentInput): boolean {
  if (candidate.accountStatus !== 'active') return false
  const identity = candidate.identities.find(
    (item) => accessScopeKey(item.scope) === accessScopeKey(scope),
  )
  return identity?.scopeStatus === 'active' && identity.memberStatus === 'active'
}

/** 有效成员才能向有效组织新增关系。 */
export function canAddOrganizationAssignment(input: OrganizationAssignmentInput): boolean {
  return input.unitEffective && isCandidateActiveInScope(input)
}

/** 失效的既有关系只允许保留或降级职责，不能新增或升级。 */
export function canChangeOrganizationDuty(input: OrganizationDutyChangeInput): boolean {
  return (
    canAddOrganizationAssignment(input) ||
    (input.initialDuty !== undefined && dutyOrder[input.nextDuty] <= dutyOrder[input.initialDuty])
  )
}

/** 启用岗位只接受可选且当前作用域有效的成员。 */
export function canAddPositionAssignment(
  input: CandidateAssignmentInput & { positionActive: boolean },
): boolean {
  return input.positionActive && !input.candidate.disabled && isCandidateActiveInScope(input)
}
