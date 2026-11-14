import type { DictionaryOption, DictionaryReference } from 'shared/types'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { dictionaryCache } from '@/store/dictionary'
import { cookie } from '@/utils/storage/cookie'
import { fetchDictionaryItems } from '@/views/dictionaries/api'

vi.mock('@/views/dictionaries/api', () => ({ fetchDictionaryItems: vi.fn() }))
const reference: DictionaryReference = { scope: { type: 'platform' }, code: 'demo_status' }
const options: DictionaryOption[] = [{ value: 'demo', label: '虚构选项' }]
beforeEach(() => {
  dictionaryCache.invalidate()
  cookie.set('token', 'fictional-dictionary-session')
})
describe('字典缓存', () => {
  it('同作用域同字典合并请求并缓存结果', async () => {
    vi.mocked(fetchDictionaryItems).mockResolvedValue(options)
    const first = dictionaryCache.load(reference)
    expect(dictionaryCache.load(reference)).toBe(first)
    await expect(first).resolves.toEqual(options)
    await dictionaryCache.load(reference)
    expect(fetchDictionaryItems).toHaveBeenCalledOnce()
  })
  it('同名字典按企业／项目隔离', async () => {
    vi.mocked(fetchDictionaryItems).mockResolvedValue(options)
    await dictionaryCache.load(reference)
    await dictionaryCache.load({
      ...reference,
      scope: { type: 'company', companyId: 'demo-company' },
    })
    expect(fetchDictionaryItems).toHaveBeenCalledTimes(2)
  })
  it('失败不缓存，下次可重试', async () => {
    vi.mocked(fetchDictionaryItems)
      .mockRejectedValueOnce(new Error('mock failure'))
      .mockResolvedValueOnce(options)
    await expect(dictionaryCache.load(reference)).rejects.toThrow('mock failure')
    await expect(dictionaryCache.load(reference)).resolves.toEqual(options)
    expect(fetchDictionaryItems).toHaveBeenCalledTimes(2)
  })
  it('失效时中止进行中的查询并拒绝迟到结果', async () => {
    let finish!: (options: DictionaryOption[]) => void
    vi.mocked(fetchDictionaryItems).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const promise = dictionaryCache.load(reference)
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    const signal = vi.mocked(fetchDictionaryItems).mock.calls[0]![0].signal
    dictionaryCache.invalidate(reference)
    expect(signal?.aborted).toBe(true)
    finish(options)
    await assertion
  })
  it('换会话不复用旧缓存，权限刷新事件也会失效', async () => {
    vi.mocked(fetchDictionaryItems).mockResolvedValue(options)
    await dictionaryCache.load(reference)
    cookie.set('token', 'another-fictional-session')
    await dictionaryCache.load(reference)
    window.dispatchEvent(new Event('workspace-access-refresh'))
    await dictionaryCache.load(reference)
    expect(fetchDictionaryItems).toHaveBeenCalledTimes(3)
  })
})
