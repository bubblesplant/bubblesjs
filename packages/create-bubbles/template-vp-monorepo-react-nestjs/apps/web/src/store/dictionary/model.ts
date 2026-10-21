import type { DictionaryOption, DictionaryReference } from 'shared/types'

export const DICTIONARY_TTL = 10 * 60 * 1000
export const DICTIONARY_MAX_ENTRIES = 200
export interface DictionaryCacheEntry extends DictionaryReference {
  items: DictionaryOption[]
  fetchedAt: number
  expiresAt: number
}
export interface DictionarySnapshot {
  schemaVersion: 1
  ownerUserId: string
  entries: Record<string, DictionaryCacheEntry>
}
