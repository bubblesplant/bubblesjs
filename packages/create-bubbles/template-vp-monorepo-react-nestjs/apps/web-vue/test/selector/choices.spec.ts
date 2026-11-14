import type { PageResult } from 'shared/types'
import { describe, expect, it, vi } from 'vite-plus/test'
import { loadPages } from '@/components/selector/choices'

vi.mock('@/views/organization/api', () => ({ organizationApi: vi.fn() }))

describe('完整关联分页读取', () => {
  it('只在第一页成功后读取后续页，并按页号顺序合并', async () => {
    let finishFirst!: (value: PageResult<string>) => void
    let finishSecond!: (value: PageResult<string>) => void
    const request = vi.fn((page: number) => {
      if (page === 1)
        return new Promise<PageResult<string>>((resolve) => {
          finishFirst = resolve
        })
      if (page === 2)
        return new Promise<PageResult<string>>((resolve) => {
          finishSecond = resolve
        })
      return Promise.resolve({ page, pageSize: 2, total: 5, items: ['e'] })
    })
    const result = loadPages(request)
    expect(request.mock.calls).toEqual([[1]])
    finishFirst({ page: 1, pageSize: 2, total: 5, items: ['a', 'b'] })
    await vi.waitFor(() => expect(request.mock.calls).toEqual([[1], [2], [3]]))
    finishSecond({ page: 2, pageSize: 2, total: 5, items: ['c', 'd'] })
    await expect(result).resolves.toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('后续页读取失败时拒绝整个集合，防止不完整数据覆盖既有关系', async () => {
    const request = vi.fn(async (page: number): Promise<PageResult<string>> => {
      if (page === 2) throw new Error('虚构分页读取失败')
      return { page, pageSize: 1, total: 2, items: ['a'] }
    })
    await expect(loadPages(request)).rejects.toThrow('虚构分页读取失败')
  })

  it('空结果不发出额外分页请求', async () => {
    const request = vi.fn(async () => ({ page: 1, pageSize: 100, total: 0, items: [] }))
    await expect(loadPages(request)).resolves.toEqual([])
    expect(request).toHaveBeenCalledOnce()
  })
})
