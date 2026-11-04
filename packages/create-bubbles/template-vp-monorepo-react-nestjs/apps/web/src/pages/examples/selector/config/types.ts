import type {
  GlobalAccountCandidate,
  OrganizationMemberCandidate,
  OrganizationRelationInput,
  OrganizationScope,
  OrganizationUnitNode,
  PositionRecord,
  RoleRecord,
} from 'shared/types'

export type SelectorExampleScope = OrganizationScope['type']

/** 示例表单保留公共字段的原始值，提交时无需额外转换。 */
export interface SelectorExampleValues {
  accountIds: string[]
  memberIds: string[]
  roleIds: string[]
  organizationIds: string[]
  organizationRelations: OrganizationRelationInput[]
  positionIds: string[]
}

/** 各字段第二回调参数保留原始候选类型；职责组织也返回组织原记录。 */
export interface SelectorExampleRecords {
  accountIds: GlobalAccountCandidate[]
  memberIds: OrganizationMemberCandidate[]
  roleIds: RoleRecord[]
  organizationIds: OrganizationUnitNode[]
  organizationRelations: OrganizationUnitNode[]
  positionIds: PositionRecord[]
}

/** 仅记录实际发生过的 onChange，初始值与程序赋值不制造回调快照。 */
export type SelectorExampleChanges = {
  [Field in keyof SelectorExampleValues]?: {
    values: SelectorExampleValues[Field]
    records: SelectorExampleRecords[Field]
  }
}
