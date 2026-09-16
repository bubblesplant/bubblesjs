import { describe, expect, it } from 'vite-plus/test'
import type { OrganizationMemberCandidate, OrganizationScope } from 'shared/types'
import {
  canAddOrganizationAssignment,
  canAddPositionAssignment,
  canChangeOrganizationDuty,
  isCandidateActiveInScope,
} from '../src/utils/organization-assignment'

const companyScope: OrganizationScope = { type: 'company', companyId: 'company-a' }

/** 创建覆盖当前企业身份及可选项目身份的成员候选。 */
function candidate({
  accountActive = true,
  companyMemberActive = true,
  disabled = false,
}: {
  accountActive?: boolean
  companyMemberActive?: boolean
  disabled?: boolean
} = {}): OrganizationMemberCandidate {
  return {
    userId: 'user-a',
    account: 'alice@example.com',
    name: 'Alice',
    accountStatus: accountActive ? 'active' : 'disabled',
    disabled,
    disabledReason: disabled ? 'memberInactive' : null,
    identities: [
      {
        scope: companyScope,
        scopeName: '企业 A',
        memberId: 'company-member',
        memberStatus: companyMemberActive ? 'active' : 'disabled',
        scopeStatus: 'active',
        organizationUnits: [],
        positions: [],
        roles: [],
      },
      {
        scope: { type: 'project', companyId: 'company-a', projectId: 'project-a' },
        scopeName: '项目 A',
        memberId: 'project-member',
        memberStatus: 'active',
        scopeStatus: 'active',
        organizationUnits: [],
        positions: [],
        roles: [],
      },
    ],
  }
}

describe('组织与岗位新增关系限制', () => {
  it('按当前作用域身份判断成员有效性，不被其他项目的有效身份掩盖', () => {
    expect(
      isCandidateActiveInScope({
        candidate: candidate({ companyMemberActive: false }),
        scope: companyScope,
      }),
    ).toBe(false)
    expect(
      isCandidateActiveInScope({
        candidate: candidate({ accountActive: false }),
        scope: companyScope,
      }),
    ).toBe(false)
  })

  it('停用成员或无效组织不能新增关系，但有效关系可以新增', () => {
    expect(
      canAddOrganizationAssignment({
        candidate: candidate({ companyMemberActive: false }),
        scope: companyScope,
        unitEffective: true,
      }),
    ).toBe(false)
    expect(
      canAddOrganizationAssignment({
        candidate: candidate(),
        scope: companyScope,
        unitEffective: false,
      }),
    ).toBe(false)
    expect(
      canAddOrganizationAssignment({
        candidate: candidate(),
        scope: companyScope,
        unitEffective: true,
      }),
    ).toBe(true)
  })

  it('失效组织关系允许原职责和降级，但禁止职责升级', () => {
    const input = {
      candidate: candidate(),
      scope: companyScope,
      unitEffective: false,
      initialDuty: 'deputy' as const,
    }
    expect(canChangeOrganizationDuty({ ...input, nextDuty: 'member' })).toBe(true)
    expect(canChangeOrganizationDuty({ ...input, nextDuty: 'deputy' })).toBe(true)
    expect(canChangeOrganizationDuty({ ...input, nextDuty: 'leader' })).toBe(false)
    expect(
      canChangeOrganizationDuty({
        candidate: candidate(),
        scope: companyScope,
        unitEffective: false,
        nextDuty: 'member',
      }),
    ).toBe(false)
  })

  it('停用岗位或不可选成员不能新增任职', () => {
    expect(
      canAddPositionAssignment({
        candidate: candidate(),
        scope: companyScope,
        positionActive: false,
      }),
    ).toBe(false)
    expect(
      canAddPositionAssignment({
        candidate: candidate({ disabled: true }),
        scope: companyScope,
        positionActive: true,
      }),
    ).toBe(false)
    expect(
      canAddPositionAssignment({
        candidate: candidate(),
        scope: companyScope,
        positionActive: true,
      }),
    ).toBe(true)
  })
})
