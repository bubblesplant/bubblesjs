import { z } from 'zod'
import {
  dictionaryKey,
  dictionaryOptionsSchema,
  dictionaryScopeSchema,
  DICTIONARY_CODE_PATTERN,
} from 'shared/utils'
import { DICTIONARY_MAX_ENTRIES, DICTIONARY_TTL, type DictionarySnapshot } from './model'

export const DICTIONARY_STORAGE_KEY = 'bubbles.dictionary-cache'
const snapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  ownerUserId: z.string().min(1),
  entries: z.record(
    z.string(),
    z.strictObject({
      scope: dictionaryScopeSchema,
      code: z.string().min(1).max(64).regex(DICTIONARY_CODE_PATTERN),
      items: dictionaryOptionsSchema,
      fetchedAt: z.number().finite().positive(),
      expiresAt: z.number().finite().positive(),
    }),
  ),
})

/** 仅删除字典专属快照；存储被禁用时保留内存能力。 */
export function removeDictionarySnapshot() {
  try {
    window.sessionStorage.removeItem(DICTIONARY_STORAGE_KEY)
  } catch {
    /* 无持久化时只使用内存。 */
  }
}

/** 校验结构、身份、键与有效期；本地数据不作为身份或访问授权依据。 */
export function readDictionarySnapshot(ownerUserId: string): DictionarySnapshot | undefined {
  try {
    const raw = window.sessionStorage.getItem(DICTIONARY_STORAGE_KEY)
    if (!raw) return
    const snapshot = snapshotSchema.parse(JSON.parse(raw))
    if (
      snapshot.ownerUserId !== ownerUserId ||
      Object.keys(snapshot.entries).length > DICTIONARY_MAX_ENTRIES
    )
      throw new TypeError('字典快照归属或容量不符')
    const now = Date.now()
    snapshot.entries = Object.fromEntries(
      Object.entries(snapshot.entries).filter(
        ([key, entry]) =>
          dictionaryKey(entry) === key &&
          entry.fetchedAt <= now &&
          entry.expiresAt > now &&
          entry.expiresAt - entry.fetchedAt === DICTIONARY_TTL,
      ),
    )
    return snapshot
  } catch {
    removeDictionarySnapshot()
    return
  }
}

/** 持久化白名单数据；存储配额或隐私策略失败不改变网络成功结果。 */
export function saveDictionarySnapshot(snapshot: DictionarySnapshot) {
  try {
    window.sessionStorage.setItem(DICTIONARY_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    removeDictionarySnapshot() /* 降级内存并删除旧快照，避免刷新恢复已失效的数据。 */
  }
}
