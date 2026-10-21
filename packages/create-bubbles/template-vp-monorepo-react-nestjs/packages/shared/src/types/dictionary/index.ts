import type { AccessScope, EntityStatus, PageQuery } from '../access'

export interface DictionaryItem {
  value: string
  label: string
  sort: number
  status: EntityStatus
}
export interface CreateDictionaryRequest {
  code: string
  name: string
  description: string
  status: EntityStatus
  items: DictionaryItem[]
}
export interface UpdateDictionaryRequest extends Omit<CreateDictionaryRequest, 'code'> {
  expectedVersion: number
}
export interface DictionaryRecord extends CreateDictionaryRequest {
  id: string
  scope: AccessScope
  version: number
  createdAt: string
  updatedAt: string
}
export interface DictionaryListQuery extends PageQuery {
  status?: EntityStatus
}
export type DictionaryOptionsQuery = { code: string } & (
  | { scopeType: 'platform' }
  | { scopeType: 'company'; companyId: string }
  | { scopeType: 'project'; companyId: string; projectId: string }
)
export interface DictionaryOption {
  label: string
  value: string
}
export interface DictionaryReference {
  scope: AccessScope
  code: string
}
export interface DictionaryOptionsRequest extends DictionaryReference {
  keyWords?: string
}
