import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { FileHashWorkerResponse } from 'shared/types'
import { calculateFileSha256 } from '../../src/services/file-hash'

/** 模拟浏览器线程生命周期，验证主线程的取消、并发及资源所有权。 */
class TestWorker {
  static instances: TestWorker[] = []
  static constructionError: Error | undefined
  static postingError: Error | undefined
  onmessage: ((event: MessageEvent<FileHashWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn(() => {
    if (TestWorker.postingError) throw TestWorker.postingError
  })

  constructor() {
    if (TestWorker.constructionError) throw TestWorker.constructionError
    TestWorker.instances.push(this)
  }

  /** 从 Worker 发回一条结构化消息。 */
  emit(message: FileHashWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<FileHashWorkerResponse>)
  }
}

const file = new Blob(['abc'])
const digest = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

/** 等待异步名额分配完成后取得线程，避免依赖固定延时。 */
async function getWorker(index = 0): Promise<TestWorker> {
  await vi.waitFor(() => expect(TestWorker.instances.length).toBeGreaterThan(index))
  return TestWorker.instances[index]!
}

/** 检查终态已清空监听并只释放一次线程。 */
function expectReleased(worker: TestWorker) {
  expect(worker.terminate).toHaveBeenCalledTimes(1)
  expect(worker.onmessage).toBeNull()
  expect(worker.onerror).toBeNull()
  expect(worker.onmessageerror).toBeNull()
}

beforeEach(() => {
  TestWorker.instances = []
  TestWorker.constructionError = undefined
  TestWorker.postingError = undefined
  vi.stubGlobal('Worker', TestWorker)
})

afterEach(() => vi.unstubAllGlobals())

describe('文件摘要 Worker 调用', () => {
  it('传递 Blob，转发进度，成功后释放线程和 abort 监听', async () => {
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const onProgress = vi.fn()
    const result = calculateFileSha256({ file, signal: controller.signal, onProgress })
    const worker = await getWorker()
    expect(worker.postMessage).toHaveBeenCalledWith({ file, chunkSize: undefined })
    worker.emit({ type: 'progress', progress: { processedBytes: 0, totalBytes: 3 } })
    worker.emit({ type: 'complete', sha256: digest })
    expect(await result).toBe(digest)
    expect(onProgress).toHaveBeenCalledWith({ processedBytes: 0, totalBytes: 3 })
    expectReleased(worker)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    controller.abort()
    expectReleased(worker)
  })

  it('最多两个并发，FIFO 等待，等待取消不启动线程', async () => {
    const results = [calculateFileSha256({ file }), calculateFileSha256({ file })]
    const controller = new AbortController()
    const cancelled = calculateFileSha256({ file, signal: controller.signal })
    const rejected = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
    results.push(
      calculateFileSha256({ file, chunkSize: 4 }),
      calculateFileSha256({ file, chunkSize: 5 }),
    )
    const first = await getWorker()
    const second = await getWorker(1)
    expect(TestWorker.instances).toHaveLength(2)
    controller.abort()
    await rejected
    first.emit({ type: 'complete', sha256: digest })
    const third = await getWorker(2)
    expect(third.postMessage).toHaveBeenCalledWith({ file, chunkSize: 4 })
    expect(TestWorker.instances).toHaveLength(3)
    second.emit({ type: 'complete', sha256: digest })
    const fourth = await getWorker(3)
    expect(fourth.postMessage).toHaveBeenCalledWith({ file, chunkSize: 5 })
    third.emit({ type: 'complete', sha256: digest })
    fourth.emit({ type: 'complete', sha256: digest })
    expect(await Promise.all(results)).toEqual(Array<string>(4).fill(digest))
    TestWorker.instances.forEach(expectReleased)
  })

  it('执行中取消立即释放，保留自定义取消原因', async () => {
    const controller = new AbortController()
    const reason = new Error('停止文件计算')
    const result = calculateFileSha256({ file, signal: controller.signal })
    const rejected = expect(result).rejects.toBe(reason)
    const worker = await getWorker()
    controller.abort(reason)
    await rejected
    expectReleased(worker)
  })

  it('已取消的任务不创建线程', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(calculateFileSha256({ file, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(TestWorker.instances).toHaveLength(0)
  })

  it.each(['error', 'messageerror', 'callback', 'worker-error', 'post-error'])(
    '%s 失败释放线程，下一任务仍可运行',
    async (failure) => {
      if (failure === 'post-error') {
        TestWorker.postingError = new Error('结构化克隆失败')
      }
      const result = calculateFileSha256({
        file,
        onProgress: () => {
          if (failure === 'callback') throw new Error('回调失败')
        },
      })
      const rejected = expect(result).rejects.toBeInstanceOf(Error)
      const worker = await getWorker()
      if (failure === 'post-error') TestWorker.postingError = undefined
      else if (failure === 'messageerror') worker.onmessageerror?.()
      else if (failure === 'worker-error') {
        worker.onerror?.({
          message: '线程启动失败',
          preventDefault: vi.fn(),
        } as unknown as ErrorEvent)
      } else if (failure === 'callback') {
        worker.emit({ type: 'progress', progress: { processedBytes: 0, totalBytes: 3 } })
      } else {
        worker.emit({ type: 'error', name: 'Error', message: '读取失败' })
      }
      await rejected
      expectReleased(worker)
      const next = calculateFileSha256({ file })
      const nextWorker = await getWorker(1)
      nextWorker.emit({ type: 'complete', sha256: digest })
      expect(await next).toBe(digest)
      expectReleased(nextWorker)
    },
  )

  it('Worker 构造失败释放名额', async () => {
    TestWorker.constructionError = new Error('Worker 不可用')
    await expect(calculateFileSha256({ file })).rejects.toThrow('Worker 不可用')
    await expect(calculateFileSha256({ file })).rejects.toThrow('Worker 不可用')
    TestWorker.constructionError = undefined
    const result = calculateFileSha256({ file })
    const worker = await getWorker()
    worker.emit({ type: 'complete', sha256: digest })
    expect(await result).toBe(digest)
  })
})
