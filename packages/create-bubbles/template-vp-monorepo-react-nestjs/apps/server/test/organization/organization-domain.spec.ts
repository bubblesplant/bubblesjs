import { describe, expect, it } from 'vite-plus/test'
import {
  deriveOrganizationUnits,
  nextOrganizationSort,
  type OrganizationUnitRow,
} from '@/modules/organization/organization.store'
import {
  cloneTemplateSnapshot,
  prepareTemplateDefinition,
} from '@/modules/organization/templates/organization-templates.store'
import { identityInCandidateFilterDomain } from '@/modules/organization/candidates/member-candidates.service'
import type { OrganizationMemberIdentity } from 'shared/types'
import { ORGANIZATION_MAX_SORT, organizationMemberCandidateQuerySchema } from 'shared/utils'

const timestamp = new Date('2026-01-01T00:00:00.000Z')

/** 创建仅供组织树派生测试使用的完整数据库记录。 */
function unit(input: {
  id: string
  parentId: string | null
  name: string
  status?: 'active' | 'disabled'
}): OrganizationUnitRow {
  return {
    id: input.id,
    treeId: 'tree',
    parentId: input.parentId,
    name: input.name,
    nameKey: input.name.toLowerCase(),
    code: input.id,
    codeKey: input.id,
    description: '',
    sort: 1,
    status: input.status ?? 'active',
    version: 1,
    sourceTemplateUnitId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

describe('组织领域纯函数', () => {
  it('把真实 GET Query 的单值、逗号字符串和重复参数数组规范化为 UUID 数组', () => {
    const firstId = crypto.randomUUID()
    const secondId = crypto.randomUUID()
    const filterFields = ['organizationUnitIds', 'positionIds', 'roleIds', 'projectIds'] as const

    for (const field of filterFields) {
      expect(organizationMemberCandidateQuerySchema.parse({ [field]: firstId })[field]).toEqual([
        firstId,
      ])
    }
    expect(
      organizationMemberCandidateQuerySchema.parse({
        positionIds: `${firstId},${secondId}`,
      }).positionIds,
    ).toEqual([firstId, secondId])
    expect(
      organizationMemberCandidateQuerySchema.parse({
        positionIds: [firstId, secondId],
      }).positionIds,
    ).toEqual([firstId, secondId])
  })

  it('GET Query 候选 ID 在规范化后仍拒绝重复值和超过一百项', () => {
    const id = crypto.randomUUID()
    expect(
      organizationMemberCandidateQuerySchema.safeParse({ positionIds: `${id},${id}` }).success,
    ).toBe(false)
    expect(
      organizationMemberCandidateQuerySchema.safeParse({
        positionIds: Array.from({ length: 101 }, () => crypto.randomUUID()).join(','),
      }).success,
    ).toBe(false)
  })

  it('派生路径、深度、有效状态和直接子节点标记', () => {
    const derived = deriveOrganizationUnits([
      unit({ id: 'root', parentId: null, name: '集团', status: 'disabled' }),
      unit({ id: 'company', parentId: 'root', name: '甲企业' }),
      unit({ id: 'finance', parentId: 'company', name: '财务部' }),
    ])

    expect(derived.get('root')).toMatchObject({
      depth: 1,
      fullPath: '集团',
      effective: false,
      hasChildren: true,
    })
    expect(derived.get('finance')).toEqual({
      depth: 3,
      fullPath: '集团 / 甲企业 / 财务部',
      effective: false,
      hasChildren: false,
    })
  })

  it('同级排序从 1 开始并在整数上限耗尽时拒绝递增', () => {
    expect(nextOrganizationSort([])).toBe(1)
    expect(nextOrganizationSort([{ sort: 2 }, { sort: 8 }])).toBe(9)
    expect(() => nextOrganizationSort([{ sort: ORGANIZATION_MAX_SORT }])).toThrow()
  })

  it('拒绝模板中重复 clientKey 和缺失父节点', () => {
    expect(() =>
      prepareTemplateDefinition({
        units: [
          {
            clientKey: 'same',
            parentClientKey: null,
            name: '组织一',
            code: 'unit-1',
            sort: 1,
          },
          {
            clientKey: 'same',
            parentClientKey: null,
            name: '组织二',
            code: 'unit-2',
            sort: 2,
          },
        ],
        positions: [],
      }),
    ).toThrow()
    expect(() =>
      prepareTemplateDefinition({
        units: [
          {
            clientKey: 'child',
            parentClientKey: 'missing',
            name: '子组织',
            code: 'child',
            sort: 1,
          },
        ],
        positions: [],
      }),
    ).toThrow()
  })

  it('拒绝模板父引用循环和超过十层的组织树', () => {
    expect(() =>
      prepareTemplateDefinition({
        units: [
          {
            clientKey: 'a',
            parentClientKey: 'b',
            name: '组织甲',
            code: 'unit-a',
            sort: 1,
          },
          {
            clientKey: 'b',
            parentClientKey: 'a',
            name: '组织乙',
            code: 'unit-b',
            sort: 2,
          },
        ],
        positions: [],
      }),
    ).toThrow()
    expect(() =>
      prepareTemplateDefinition({
        units: Array.from({ length: 11 }, (_, index) => ({
          clientKey: `unit-${index}`,
          parentClientKey: index === 0 ? null : `unit-${index - 1}`,
          name: `组织${index + 1}`,
          code: `unit-${index}`,
          sort: index,
        })),
        positions: [],
      }),
    ).toThrow()
  })

  it('复制模板快照时生成新 ID 并重新映射父子关系', () => {
    const snapshot = cloneTemplateSnapshot({
      units: [
        {
          id: 'old-root',
          parentId: null,
          name: '集团',
          nameKey: '集团',
          code: 'group',
          codeKey: 'group',
          description: '',
          sort: 1,
        },
        {
          id: 'old-child',
          parentId: 'old-root',
          name: '财务部',
          nameKey: '财务部',
          code: 'finance',
          codeKey: 'finance',
          description: '',
          sort: 2,
        },
      ],
      positions: [
        {
          name: '会计',
          nameKey: '会计',
          code: 'accountant',
          codeKey: 'accountant',
          description: '',
          status: 'active',
        },
      ],
    })

    expect(snapshot.units[0]?.id).not.toBe('old-root')
    expect(snapshot.units[1]?.id).not.toBe('old-child')
    expect(snapshot.units[1]?.parentId).toBe(snapshot.units[0]?.id)
    expect(snapshot.positions[0]?.id).toBeTruthy()
  })

  it('企业候选未指定项目时只让企业身份参与筛选', () => {
    const companyIdentity = {
      scope: { type: 'company', companyId: 'company-1' },
      scopeName: '甲企业',
      memberId: 'company-member',
      memberStatus: 'active',
      scopeStatus: 'active',
      organizationUnits: [],
      positions: [],
      roles: [],
    } satisfies OrganizationMemberIdentity
    const projectIdentity = {
      ...companyIdentity,
      scope: { type: 'project', companyId: 'company-1', projectId: 'project-1' },
      scopeName: '项目一',
      memberId: 'project-member',
    } satisfies OrganizationMemberIdentity

    expect(
      identityInCandidateFilterDomain(
        companyIdentity,
        { type: 'company', companyId: 'company-1' },
        {},
      ),
    ).toBe(true)
    expect(
      identityInCandidateFilterDomain(
        projectIdentity,
        { type: 'company', companyId: 'company-1' },
        {},
      ),
    ).toBe(false)
    expect(
      identityInCandidateFilterDomain(
        projectIdentity,
        { type: 'company', companyId: 'company-1' },
        { projectIds: ['project-1'] },
      ),
    ).toBe(true)
  })
})
