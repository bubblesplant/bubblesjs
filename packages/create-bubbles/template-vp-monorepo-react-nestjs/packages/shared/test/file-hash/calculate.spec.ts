import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vite-plus/test'

import { calculateBlobSha256 } from '../../src/utils/file-hash/calculate'

describe('完整 Blob SHA-256', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['a'.repeat(1_000_000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
  ])('匹配标准向量（%#）', async (content, expected) => {
    expect(await calculateBlobSha256({ file: new Blob([content]) })).toBe(expected)
  })

  it('二进制跨读取边界、不同文件名均与 Node crypto 一致', async () => {
    const bytes = Uint8Array.from({ length: 65_537 }, (_, index) => index % 256)
    const expected = createHash('sha256').update(bytes).digest('hex')
    for (const chunkSize of [1, 63, 64, 65, 4096, 16 * 1024 * 1024]) {
      const file = new File([bytes], `${chunkSize}.bin`)
      expect(await calculateBlobSha256({ file, chunkSize })).toBe(expected)
    }
  })

  it('只读取有界切片，报告单调的起止进度', async () => {
    const file = new Blob([new Uint8Array(10_001)])
    const originalSlice = file.slice.bind(file)
    const readSizes: number[] = []
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('禁止整文件读取'))
    vi.spyOn(file, 'slice').mockImplementation((start, end) => {
      readSizes.push((end ?? file.size) - (start ?? 0))
      return originalSlice(start, end)
    })
    const onProgress = vi.fn()
    await calculateBlobSha256({ file, chunkSize: 1000, onProgress })
    expect(readSizes).toEqual([...Array<number>(10).fill(1000), 1])
    expect(onProgress.mock.calls[0]?.[0]).toEqual({ processedBytes: 0, totalBytes: 10_001 })
    expect(onProgress.mock.lastCall?.[0]).toEqual({ processedBytes: 10_001, totalBytes: 10_001 })
  })

  it.each([0, -1, 1.5, Number.NaN, 16 * 1024 * 1024 + 1])(
    '拒绝非法读取块大小 %s',
    async (chunkSize) => {
      await expect(calculateBlobSha256({ file: new Blob(), chunkSize })).rejects.toThrow(RangeError)
    },
  )

  it('中间进度节流，同时保留开始与最终进度', async () => {
    const clock = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(50)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(101)
    const onProgress = vi.fn()
    try {
      await calculateBlobSha256({ file: new Blob(['abc']), chunkSize: 1, onProgress })
      expect(onProgress.mock.calls.map(([progress]) => progress.processedBytes)).toEqual([0, 2, 3])
    } finally {
      clock.mockRestore()
    }
  })

  it('预先取消不读取文件，保留取消原因', async () => {
    const controller = new AbortController()
    const reason = new Error('用户取消')
    controller.abort(reason)
    const file = new Blob(['abc'])
    const slice = vi.spyOn(file, 'slice')
    await expect(calculateBlobSha256({ file, signal: controller.signal })).rejects.toBe(reason)
    expect(slice).not.toHaveBeenCalled()
  })

  it('读取过程中取消，不返回摘要或读取下一块', async () => {
    const controller = new AbortController()
    const file = new Blob(['abcdef'])
    const slice = vi.spyOn(file, 'slice').mockReturnValue({
      arrayBuffer: async () => {
        controller.abort()
        return new ArrayBuffer(3)
      },
    } as Blob)
    await expect(
      calculateBlobSha256({ file, signal: controller.signal, chunkSize: 3 }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(slice).toHaveBeenCalledTimes(1)
  })

  it('短读和读取失败不能产生部分结果', async () => {
    const file = new Blob(['abc'])
    vi.spyOn(file, 'slice').mockReturnValue(new Blob(['ab']))
    await expect(calculateBlobSha256({ file })).rejects.toThrow('长度')
    const reason = new Error('读取失败')
    vi.spyOn(file, 'slice').mockImplementation(() => {
      throw reason
    })
    await expect(calculateBlobSha256({ file })).rejects.toBe(reason)
  })

  it('进度回调失败按原错误拒绝', async () => {
    const reason = new Error('进度处理失败')
    await expect(
      calculateBlobSha256({
        file: new Blob(['abc']),
        onProgress: () => {
          throw reason
        },
      }),
    ).rejects.toBe(reason)
  })
})
