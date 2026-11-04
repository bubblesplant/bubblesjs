import type {
  GlobalAccountCandidate,
  OrganizationMemberCandidate,
  OrganizationScope,
  OrganizationUnitNode,
  PositionRecord,
  RoleRecord,
} from 'shared/types'
import type { SelectorExampleScope, SelectorExampleValues } from './types'

const timestamp = '2026-11-04T00:00:00.000Z'
const unitNames = ['研发中心', '产品中心', '设计中心', '运营中心']
const positionNames = ['前端工程师', '产品经理', '交互设计师', '项目协调员']
const roleNames = ['项目协作员', '业务审核员', '资料维护员']
const userNames = ['演示成员甲', '演示成员乙', '演示成员丙', '演示成员丁']

/** 构造完整且隔离的虚构企业／项目候选，示例无需连接业务服务。 */
export function createSelectorExampleData(type: SelectorExampleScope) {
  const scope: OrganizationScope =
    type === 'company'
      ? { type, companyId: 'demo-company' }
      : { type, companyId: 'demo-company', projectId: 'demo-project' }
  const scopeName = type === 'company' ? '演示企业' : '演示项目'
  const units: OrganizationUnitNode[] = Array.from({ length: 32 }, (_, index) => {
    const name = unitNames[index] ?? `协作组 ${index + 1}`
    return {
      id: `${type}-org-${index + 1}`,
      treeId: `${type}-tree`,
      parentId: null,
      name,
      code: `ORG-${index + 1}`,
      description: '虚构组织，仅用于示例',
      sort: index,
      status: index === 31 ? 'disabled' : 'active',
      version: 1,
      depth: 0,
      fullPath: `${scopeName} / ${name}`,
      effective: index !== 31,
      hasChildren: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
  const positions: PositionRecord[] = Array.from({ length: 32 }, (_, index) => ({
    id: `${type}-position-${index + 1}`,
    scope,
    name: positionNames[index] ?? `协作岗位 ${index + 1}`,
    code: `POS-${index + 1}`,
    description: '虚构岗位，仅用于示例',
    status: index === 31 ? 'disabled' : 'active',
    version: 1,
    memberCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
  const roles: RoleRecord[] = Array.from({ length: 24 }, (_, index) => ({
    id: `${type}-role-${index + 1}`,
    scope,
    name: roleNames[index] ?? `协作角色 ${index + 1}`,
    description: '虚构角色，仅用于示例',
    builtin: index === 0 ? 'member' : null,
    permissionKeys: [],
    version: 1,
    memberCount: 0,
    assignable: index !== 23,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
  const accounts: GlobalAccountCandidate[] = Array.from({ length: 28 }, (_, index) => ({
    userId: `demo-user-${index + 1}`,
    name: userNames[index] ?? `演示成员 ${index + 1}`,
    account: `demo.${index + 1}@example.invalid`,
    status: index === 27 ? 'disabled' : 'active',
    disabled: index === 27,
    disabledReason: index === 27 ? 'accountInactive' : null,
  }))
  const members: OrganizationMemberCandidate[] = accounts.map((account, index) => ({
    userId: account.userId,
    name: account.name,
    account: account.account,
    accountStatus: account.status,
    disabled: account.disabled,
    disabledReason: account.disabledReason,
    identities: [
      {
        scope,
        scopeName,
        memberId: `${type}-member-${index + 1}`,
        memberStatus: 'active',
        scopeStatus: 'active',
        organizationUnits: [],
        positions: [],
        roles: [],
      },
    ],
  }))
  const initialValues: SelectorExampleValues = {
    accountIds: ['demo-user-1'],
    memberIds: ['demo-user-1', 'demo-user-2'],
    roleIds: [`${type}-role-1`],
    organizationIds: [`${type}-org-1`],
    organizationRelations: [{ organizationUnitId: `${type}-org-1`, duty: 'leader' }],
    positionIds: [`${type}-position-1`],
  }
  return { scope, scopeName, units, positions, roles, accounts, members, initialValues }
}

/** 清空所有字段并保留两种组织值的独立协议。 */
export function createEmptySelectorValues(): SelectorExampleValues {
  return {
    accountIds: [],
    memberIds: [],
    roleIds: [],
    organizationIds: [],
    organizationRelations: [],
    positionIds: [],
  }
}
