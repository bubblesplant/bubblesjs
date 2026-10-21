// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { dictionaryKey } from 'shared/utils'
import { DICTIONARY_TTL, type DictionarySnapshot } from '../../src/store/dictionary/model'
import {
  DICTIONARY_STORAGE_KEY,
  readDictionarySnapshot,
  removeDictionarySnapshot,
  saveDictionarySnapshot,
} from '../../src/store/dictionary/persistence'

/** 构造与当前快照结构相符的虚构字典。 */
function snapshot(): DictionarySnapshot {
  const reference = { scope: { type: 'platform' as const }, code: 'units' }
  const fetchedAt = Date.now()
  return {
    schemaVersion: 1,
    ownerUserId: 'qa-user',
    entries: {
      [dictionaryKey(reference)]: {
        ...reference,
        fetchedAt,
        expiresAt: fetchedAt + DICTIONARY_TTL,
        items: [{ label: '米', value: 'm' }],
      },
    },
  }
}
afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})
describe('字典 sessionStorage', () => {
  it('刷新后恢复匹配账号快照', () => {
    const value = snapshot()
    saveDictionarySnapshot(value)
    expect(readDictionarySnapshot('qa-user')).toEqual(value)
  })
  it('换号丢弃快照，并只删除专属键', () => {
    sessionStorage.setItem('business-draft', '保留')
    saveDictionarySnapshot(snapshot())
    expect(readDictionarySnapshot('other-user')).toBeUndefined()
    expect(sessionStorage.getItem(DICTIONARY_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem('business-draft')).toBe('保留')
  })
  it.each(['{bad json', JSON.stringify({ schemaVersion: 2 }), 'null'])(
    '损坏或不兼容快照降级：%s',
    (raw) => {
      sessionStorage.setItem(DICTIONARY_STORAGE_KEY, raw)
      expect(readDictionarySnapshot('qa-user')).toBeUndefined()
    },
  )
  it('移除过期、未来时间与键伪造记录', () => {
    const data = snapshot()
    const entry = Object.values(data.entries)[0]!
    data.entries = { forged: entry, expired: { ...entry, expiresAt: 1 } }
    saveDictionarySnapshot(data)
    expect(readDictionarySnapshot('qa-user')!.entries).toEqual({})
  })
  it('存储被禁用时读写删除均不抛错', () => {
    const storage = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('disabled')
    })
    expect(() => saveDictionarySnapshot(snapshot())).not.toThrow()
    expect(readDictionarySnapshot('qa-user')).toBeUndefined()
    expect(() => removeDictionarySnapshot()).not.toThrow()
    storage.mockRestore()
  })
  it('写入配额失败时删除旧快照，防止失效记录在刷新后恢复', () => {
    saveDictionarySnapshot(snapshot())
    const write = vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveDictionarySnapshot({ ...snapshot(), entries: {} })).not.toThrow()
    expect(window.sessionStorage.getItem(DICTIONARY_STORAGE_KEY)).toBeNull()
    write.mockRestore()
  })
})
