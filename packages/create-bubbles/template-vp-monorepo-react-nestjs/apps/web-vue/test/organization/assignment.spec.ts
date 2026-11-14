import type {
  OrganizationMemberCandidate,
  OrganizationMemberIdentity,
  OrganizationScope,
} from 'shared/types'
import {
  canAddOrganizationAssignment,
  canAddPositionAssignment,
  canChangeOrganizationDuty,
  isCandidateActiveInScope,
} from 'shared/utils'
import { describe, expect, it } from 'vite-plus/test'

const scope: OrganizationScope = { type: 'company', companyId: 'demo-company' }

/** 为有效性边界测试构造一个仅含虚构成员的完整候选快照。 */
function candidate(
  overrides: Partial<OrganizationMemberCandidate> = {},
): OrganizationMemberCandidate {
  return {
    userId: 'demo-user',
    name: '虚构成员',
    account: 'demo_member',
    accountStatus: 'active',
    disabled: false,
    disabledReason: null,
    identities: [
      {
        scope,
        scopeName: '虚构企业',
        memberId: 'demo-member',
        memberStatus: 'active',
        scopeStatus: 'active',
        organizationUnits: [],
        positions: [],
        roles: [],
      },
    ],
    ...overrides,
  }
}

/** 修改身份状态时保留其余契约字段。 */
function withIdentity(overrides: Partial<OrganizationMemberIdentity>): OrganizationMemberCandidate {
  const record = candidate()
  record.identities[0] = { ...record.identities[0]!, ...overrides }
  return record
}

describe('组织与岗位关联边界', () => {
  it('账号、空间和成员均有效才允许新增组织关系', () => {
    expect(
      canAddOrganizationAssignment({ candidate: candidate(), scope, unitEffective: true }),
    ).toBe(true)
    expect(
      canAddOrganizationAssignment({ candidate: candidate(), scope, unitEffective: false }),
    ).toBe(false)
    for (const record of [
      candidate({ accountStatus: 'locked' }),
      candidate({ accountStatus: 'disabled' }),
      withIdentity({ memberStatus: 'disabled' }),
      withIdentity({ scopeStatus: 'disabled' }),
    ]) {
      expect(isCandidateActiveInScope({ candidate: record, scope })).toBe(false)
      expect(canAddOrganizationAssignment({ candidate: record, scope, unitEffective: true })).toBe(
        false,
      )
    }
  })

  it('其他企业或项目身份不能代替当前空间身份', () => {
    for (const otherScope of [
      { type: 'company', companyId: 'another-company' },
      { type: 'project', companyId: 'demo-company', projectId: 'demo-project' },
    ] satisfies OrganizationScope[]) {
      expect(
        isCandidateActiveInScope({ candidate: withIdentity({ scope: otherScope }), scope }),
      ).toBe(false)
    }
    const projectScope: OrganizationScope = {
      type: 'project',
      companyId: 'demo-company',
      projectId: 'demo-project',
    }
    expect(isCandidateActiveInScope({ candidate: candidate(), scope: projectScope })).toBe(false)
    expect(
      isCandidateActiveInScope({
        candidate: withIdentity({ scope: projectScope }),
        scope: projectScope,
      }),
    ).toBe(true)
  })

  it('失效既有关系可保留、降级，但不能升级或重新新增', () => {
    const input = {
      candidate: candidate({ accountStatus: 'disabled' }),
      scope,
      unitEffective: false,
    }
    expect(canChangeOrganizationDuty({ ...input, initialDuty: 'leader', nextDuty: 'leader' })).toBe(
      true,
    )
    expect(canChangeOrganizationDuty({ ...input, initialDuty: 'leader', nextDuty: 'deputy' })).toBe(
      true,
    )
    expect(canChangeOrganizationDuty({ ...input, initialDuty: 'deputy', nextDuty: 'member' })).toBe(
      true,
    )
    expect(canChangeOrganizationDuty({ ...input, initialDuty: 'member', nextDuty: 'deputy' })).toBe(
      false,
    )
    expect(canChangeOrganizationDuty({ ...input, nextDuty: 'member' })).toBe(false)
    expect(canChangeOrganizationDuty({ ...input, nextDuty: 'leader' })).toBe(false)
  })

  it('有效关系允许升级职责', () => {
    expect(
      canChangeOrganizationDuty({
        candidate: candidate(),
        scope,
        unitEffective: true,
        initialDuty: 'member',
        nextDuty: 'leader',
      }),
    ).toBe(true)
  })

  it('新增岗位必须启用、可选且属于当前有效空间', () => {
    const input = { candidate: candidate(), scope, positionActive: true }
    expect(canAddPositionAssignment(input)).toBe(true)
    expect(canAddPositionAssignment({ ...input, positionActive: false })).toBe(false)
    expect(
      canAddPositionAssignment({
        ...input,
        candidate: candidate({ disabled: true, disabledReason: 'positionInactive' }),
      }),
    ).toBe(false)
    expect(
      canAddPositionAssignment({ ...input, candidate: withIdentity({ memberStatus: 'disabled' }) }),
    ).toBe(false)
    expect(
      canAddPositionAssignment({
        ...input,
        candidate: withIdentity({ scope: { type: 'company', companyId: 'another-company' } }),
      }),
    ).toBe(false)
  })
})
