import { describe, expect, it } from 'vite-plus/test'
import {
  createCompanySchema,
  createOrganizationTemplateSchema,
  createPositionSchema,
  createProjectSchema,
  normalizeOrganizationKey,
  organizationMemberCandidateQuerySchema,
  replaceMemberOrganizationUnitsSchema,
  resolveGlobalAccountCandidatesSchema,
} from '../src/utils'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000002'
const UNIT_ID = '00000000-0000-4000-8000-000000000003'

describe('组织共享写入契约', () => {
  it('项目必须显式选择空白或精确模板版本，并拒绝两种模式字段混用', () => {
    expect(
      createProjectSchema.parse({
        name: '示例项目',
        code: 'PROJECT_A',
        administratorUserId: USER_ID,
        organizationInitialization: { mode: 'blank' },
      }),
    ).toMatchObject({
      code: 'project_a',
      organizationInitialization: { mode: 'blank' },
    })
    expect(
      createProjectSchema.safeParse({
        name: '示例项目',
        code: 'project_a',
        administratorUserId: USER_ID,
      }).success,
    ).toBe(false)
    expect(
      createProjectSchema.safeParse({
        name: '示例项目',
        code: 'project_a',
        administratorUserId: USER_ID,
        organizationInitialization: { mode: 'blank', templateId: TEMPLATE_ID },
      }).success,
    ).toBe(false)
    expect(
      createProjectSchema.safeParse({
        name: '示例项目',
        code: 'project_a',
        administratorUserId: USER_ID,
        organizationInitialization: { mode: 'template', templateId: TEMPLATE_ID },
      }).success,
    ).toBe(false)
  })

  it('排序只接受范围内单整数，岗位严格拒绝组织单元关联字段', () => {
    expect(
      createCompanySchema.safeParse({
        name: '示例企业',
        code: 'company_a',
        administratorUserId: USER_ID,
        sort: 1.5,
      }).success,
    ).toBe(false)
    expect(
      createCompanySchema.safeParse({
        name: '示例企业',
        code: 'company_a',
        administratorUserId: USER_ID,
        sort: 1_000_000_000,
      }).success,
    ).toBe(false)
    expect(
      createPositionSchema.safeParse({
        name: '财务负责人',
        code: 'finance_owner',
        organizationUnitId: UNIT_ID,
      }).success,
    ).toBe(false)
  })

  it('组织关系允许完整清空但拒绝同一组织单元重复出现', () => {
    expect(replaceMemberOrganizationUnitsSchema.parse({ relations: [] })).toEqual({ relations: [] })
    expect(
      replaceMemberOrganizationUnitsSchema.safeParse({
        relations: [
          { organizationUnitId: UNIT_ID, duty: 'leader' },
          { organizationUnitId: UNIT_ID, duty: 'member' },
        ],
      }).success,
    ).toBe(false)
  })

  it('模板岗位保持平面结构，strict DTO 拒绝模板组织关联字段', () => {
    expect(
      createOrganizationTemplateSchema.safeParse({
        name: '标准项目组织',
        units: [],
        positions: [
          {
            name: '项目经理',
            code: 'project_manager',
            status: 'active',
            organizationUnitId: UNIT_ID,
          },
        ],
      }).success,
    ).toBe(false)
  })
})

describe('组织规范化与候选边界', () => {
  it('NFKC 展开后的名称键不截断，展示名称仍按原始 100 字符上限校验', () => {
    const displayName = '㍿'.repeat(100)
    const normalized = normalizeOrganizationKey(displayName)
    expect(displayName).toHaveLength(100)
    expect(normalized.length).toBeGreaterThan(100)
    expect(
      createCompanySchema.safeParse({
        name: displayName,
        code: 'nfkc_company',
        administratorUserId: USER_ID,
      }).success,
    ).toBe(true)
  })

  it('候选筛选接受字符串布尔值并限制每类 ID 最多一百个且不能重复', () => {
    expect(
      organizationMemberCandidateQuerySchema.parse({
        unassigned: 'true',
        includeDisabled: 'false',
      }),
    ).toMatchObject({ unassigned: true, includeDisabled: false })
    expect(
      organizationMemberCandidateQuerySchema.safeParse({
        organizationUnitIds: [UNIT_ID, UNIT_ID],
      }).success,
    ).toBe(false)
    const tooManyIds = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    )
    expect(
      organizationMemberCandidateQuerySchema.safeParse({ organizationUnitIds: tooManyIds }).success,
    ).toBe(false)
  })

  it('全局候选回显正文保持严格 JSON 数组，并拒绝重复或超过一百个账号 ID', () => {
    const purpose = 'createCompanyAdministrator'
    expect(
      resolveGlobalAccountCandidatesSchema.safeParse({ purpose, userIds: USER_ID }).success,
    ).toBe(false)
    expect(
      resolveGlobalAccountCandidatesSchema.safeParse({
        purpose,
        userIds: [USER_ID, USER_ID],
      }).success,
    ).toBe(false)
    expect(
      resolveGlobalAccountCandidatesSchema.safeParse({
        purpose,
        userIds: Array.from(
          { length: 101 },
          (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
        ),
      }).success,
    ).toBe(false)
  })
})
