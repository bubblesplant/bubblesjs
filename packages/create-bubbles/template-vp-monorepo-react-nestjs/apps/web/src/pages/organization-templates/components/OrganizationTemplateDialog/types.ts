import type { EntityStatus } from 'shared/types'

export interface TemplateUnitValues {
  clientKey: string
  parentClientKey?: string | null
  name: string
  code: string
  description?: string
  sort: number
}

export interface TemplatePositionValues {
  name: string
  code: string
  description?: string
  status: EntityStatus
}

export interface TemplateFormValues {
  name: string
  description?: string
  isDefault: boolean
  units: TemplateUnitValues[]
  positions: TemplatePositionValues[]
}
