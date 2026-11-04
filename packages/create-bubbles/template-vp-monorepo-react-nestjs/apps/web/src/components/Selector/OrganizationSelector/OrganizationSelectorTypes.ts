import type {
  OrganizationDuty,
  OrganizationRelationInput,
  OrganizationUnitNode,
} from 'shared/types'

/** 每次打开时注入候选组织、回显与业务禁选规则，不依赖成员或请求接口。 */
export interface OrganizationSelectorOpenOptions {
  units: readonly OrganizationUnitNode[]
  value?: readonly string[]
  /** 默认多选；不影响职责开关对应的数组结构。 */
  multiple?: boolean
  relations?: readonly OrganizationRelationInput[]
  title?: string
  description?: ReactNode
  isOrganizationDisabled?: (unit: OrganizationUnitNode) => boolean
  isDutyDisabled?: (input: { unit: OrganizationUnitNode; duty: OrganizationDuty }) => boolean
}

export interface OrganizationSelectorRef {
  show: (options: OrganizationSelectorOpenOptions) => void
  hide: () => void
}

type ConfirmResult = void | boolean | Promise<void | boolean>

/** 职责开关决定确认值的类型；第二参数始终为原始组织记录数组。 */
export type OrganizationSelectorProps = {
  ref: Ref<OrganizationSelectorRef>
} & (
  | {
      enableDuties?: false
      onConfirm: (organizationUnitIds: string[], records: OrganizationUnitNode[]) => ConfirmResult
    }
  | {
      enableDuties: true
      onConfirm: (
        relations: OrganizationRelationInput[],
        records: OrganizationUnitNode[],
      ) => ConfirmResult
    }
)
