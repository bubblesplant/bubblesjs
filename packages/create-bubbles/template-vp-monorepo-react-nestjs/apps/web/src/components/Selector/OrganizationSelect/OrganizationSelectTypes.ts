import type { OrganizationRelationInput, OrganizationUnitNode } from 'shared/types'
import type { OrganizationSelectorOpenOptions } from '../OrganizationSelector'
import type { SelectorFieldStyleProps } from '../components/SelectorField'

/** 职责开关同时约束受控值与 onChange；默认用于只选择组织的业务单。 */
export type OrganizationSelectProps = SelectorFieldStyleProps &
  Omit<OrganizationSelectorOpenOptions, 'value' | 'relations'> &
  (
    | {
        enableDuties?: false
        value?: string[]
        onChange?: (ids: string[], records: OrganizationUnitNode[]) => void
      }
    | {
        enableDuties: true
        value?: OrganizationRelationInput[]
        onChange?: (relations: OrganizationRelationInput[], records: OrganizationUnitNode[]) => void
      }
  )
