import { calculateFileSha256 } from '../../../../apps/web/src/services/file-hash'

/** 在真实浏览器记录 Worker 所有权、结果、取消与主线程调度采样。 */
async function runFileHashProbe() {
  // 测试数据生成在采样前完成，避免把构造大数组的耗时算作摘要线程阻塞。
  const fixtures = [0, 3, 5 * 1024 * 1024 + 17, 16 * 1024 * 1024 + 1].map((size) => {
    const bytes = Uint8Array.from({ length: size }, (_, index) => index % 256)
    return { size, file: new File([bytes], `${size}.bin`) }
  })
  const largeFile = new Blob(Array<BlobPart>(64).fill(new Uint8Array(1024 * 1024)))
  const NativeWorker = globalThis.Worker
  let activeWorkers = 0
  let maxActiveWorkers = 0
  let createdWorkers = 0
  let terminatedWorkers = 0
  let heartbeatCount = 0
  let maxHeartbeatDelayMs = 0
  let lastHeartbeat = performance.now()
  const timer = setInterval(() => {
    const now = performance.now()
    maxHeartbeatDelayMs = Math.max(maxHeartbeatDelayMs, now - lastHeartbeat)
    lastHeartbeat = now
    heartbeatCount += 1
  }, 10)

  globalThis.Worker = class extends NativeWorker {
    private released = false

    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      super(scriptURL, options)
      activeWorkers += 1
      createdWorkers += 1
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers)
    }

    /** 统计真实终止操作，重复调用不重复扣减线程计数。 */
    override terminate() {
      if (!this.released) {
        this.released = true
        activeWorkers -= 1
        terminatedWorkers += 1
      }
      super.terminate()
    }
  }

  const startedAt = performance.now()
  try {
    const results = await Promise.all(
      fixtures.map(async ({ size, file }) => {
        const progress: number[] = []
        const sha256 = await calculateFileSha256({
          file,
          onProgress: ({ processedBytes }) => progress.push(processedBytes),
        })
        return { size, sha256, progress }
      }),
    )

    const runningController = new AbortController()
    const queuedController = new AbortController()
    const running = calculateFileSha256({
      file: largeFile,
      signal: runningController.signal,
      onProgress: () => runningController.abort(),
    }).then(
      () => 'unexpected-success',
      (error: Error) => error.name,
    )
    const normal = calculateFileSha256({ file: largeFile })
    const queued = calculateFileSha256({
      file: largeFile,
      signal: queuedController.signal,
    }).then(
      () => 'unexpected-success',
      (error: Error) => error.name,
    )
    queuedController.abort()
    const runningCancel = await running
    const queuedCancel = await queued
    const largeSha256 = await normal
    const callbackError = await calculateFileSha256({
      file: new Blob(['abc']),
      onProgress: () => {
        throw new Error('probe-callback-error')
      },
    }).then(
      () => 'unexpected-success',
      (error: Error) => error.message,
    )
    const recoverySha256 = await calculateFileSha256({ file: new Blob(['abc']) })
    return {
      results,
      runningCancel,
      queuedCancel,
      largeSha256,
      callbackError,
      recoverySha256,
      maxActiveWorkers,
      activeWorkers,
      createdWorkers,
      terminatedWorkers,
      heartbeatCount,
      maxHeartbeatDelayMs,
      elapsedMs: performance.now() - startedAt,
    }
  } finally {
    clearInterval(timer)
    globalThis.Worker = NativeWorker
  }
}

Object.assign(globalThis, { runFileHashProbe })
