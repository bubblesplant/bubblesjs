import 'reflect-metadata'
import { createHash } from 'node:crypto'
import { PassThrough, Readable } from 'node:stream'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { ContentHashService } from '@/modules/upload/hash/content-hash.service'
import { StorageObjectReadError } from '@/modules/upload/storage/storage.port'

/** 将二进制块作为对象存储流输入真实线程，验证完整摘要而非模拟 crypto。 */
function calculate(
  chunks: Uint8Array[],
  expectedSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
) {
  return new ContentHashService().calculate({
    expectedSize,
    openStream: async () => Readable.from(chunks),
  })
}

afterEach(() => vi.useRealTimers())

describe('原生 crypto 完整内容摘要', () => {
  it('符合 SHA-256 标准向量，并支持零字节内核输入', async () => {
    expect(await calculate([Buffer.from('a'), Buffer.from('bc')])).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await calculate([])).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('标准百万 a 向量可跨传输块连续计算', async () => {
    expect(await calculate([Buffer.alloc(1_000_000, 'a')])).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    )
  })

  it('二进制字节和读取边界不会改变摘要，也不会转移调用方 Buffer 池', async () => {
    const bytes = Buffer.alloc(700_001)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256
    const expected = createHash('sha256').update(bytes).digest('hex')
    const pieces = [bytes.subarray(0, 1), bytes.subarray(1, 66_667), bytes.subarray(66_667)]
    expect(await calculate(pieces)).toBe(expected)
    expect(await calculate([bytes])).toBe(expected)
    expect(bytes.byteLength).toBe(700_001)
    expect(bytes[255]).toBe(255)
  })

  it.each([2, 4])('实际三字节不等于声明 %i 字节时拒绝结果', async (expectedSize) => {
    await expect(calculate([Buffer.from('abc')], expectedSize)).rejects.toMatchObject({
      definition: { code: 'UPLOAD.OBJECT_VERIFICATION_FAILED' },
    })
  })

  it('读取中断拒绝部分摘要并销毁流', async () => {
    const body = new Readable({
      read() {
        this.destroy(new Error('simulated storage read failure'))
      },
    })
    await expect(
      new ContentHashService().calculate({ expectedSize: 3, openStream: async () => body }),
    ).rejects.toBeInstanceOf(StorageObjectReadError)
    expect(body.destroyed).toBe(true)
  })

  it('限制并发并在完成后释放名额', async () => {
    const service = new ContentHashService()
    const bodies = [new PassThrough(), new PassThrough()]
    const pending = bodies.map((body) =>
      service.calculate({ expectedSize: 3, openStream: async () => body }),
    )
    await expect(
      service.calculate({ expectedSize: 0, openStream: async () => Readable.from([]) }),
    ).rejects.toMatchObject({ definition: { code: 'UPLOAD.VERIFICATION_BUSY' } })
    for (const body of bodies) body.end('abc')
    await Promise.all(pending)
    expect(
      await service.calculate({ expectedSize: 0, openStream: async () => Readable.from([]) }),
    ).toHaveLength(64)
  })

  it('超时取消读取并释放线程', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const service = new ContentHashService()
    const body = new PassThrough()
    const pending = service.calculate({ expectedSize: 3, openStream: async () => body })
    const assertion = expect(pending).rejects.toMatchObject({
      definition: { code: 'UPLOAD.VERIFICATION_TIMEOUT' },
    })
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    await assertion
    expect(body.destroyed).toBe(true)
    await service.onModuleDestroy()
  })

  it('应用关闭会取消在途读取并拒绝新校验', async () => {
    const service = new ContentHashService()
    const body = new PassThrough()
    const pending = service.calculate({ expectedSize: 3, openStream: async () => body })
    const assertion = expect(pending).rejects.toThrow('shutting down')
    await service.onModuleDestroy()
    await assertion
    expect(body.destroyed).toBe(true)
    await expect(
      service.calculate({ expectedSize: 0, openStream: async () => Readable.from([]) }),
    ).rejects.toMatchObject({ definition: { code: 'UPLOAD.VERIFICATION_BUSY' } })
  })

  it('线程消息发送错误保持程序错误语义，仍释放计算名额', async () => {
    const spy = vi.spyOn(Worker.prototype, 'postMessage').mockImplementationOnce(() => {
      throw new Error('simulated worker failure')
    })
    await expect(calculate([Buffer.from('abc')])).rejects.toThrow('simulated worker failure')
    spy.mockRestore()
    expect(await calculate([Buffer.from('abc')])).toHaveLength(64)
  })
})
