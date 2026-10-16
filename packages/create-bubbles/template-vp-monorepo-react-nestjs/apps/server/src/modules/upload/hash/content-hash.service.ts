import { AppException } from '@/common/exceptions/app.exception'
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { Worker } from 'node:worker_threads'
import { StorageObjectReadError } from '../storage/storage.port'
import { UPLOAD_ERRORS } from '../upload.errors'

const MAX_ACTIVE_HASHES = 2
const HASH_TIMEOUT_MS = 30 * 60 * 1000
const HASH_CHUNK_SIZE = 256 * 1024

interface HashInput {
  expectedSize: number
  openStream: (signal: AbortSignal) => Promise<Readable>
}

@Injectable()
export class ContentHashService implements OnModuleDestroy {
  private readonly active = new Map<AbortController, Promise<void>>()
  private stopping = false

  /** 保留等待中的线程消息与失败通知，兼容当前 ES2023 类型配置。 */
  private deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (cause: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    return { promise, resolve, reject }
  }

  /** 限制进程内校验并发，在线程中计算完整 SHA-256；流与线程由本方法统一释放。 */
  async calculate(input: HashInput): Promise<string> {
    if (this.stopping || this.active.size >= MAX_ACTIVE_HASHES) {
      throw new AppException(UPLOAD_ERRORS.VERIFICATION_BUSY)
    }

    const controller = new AbortController()
    const done = this.deferred<void>()
    this.active.set(controller, done.promise)
    try {
      return await this.calculateInWorker(input, controller)
    } finally {
      this.active.delete(controller)
      done.resolve(undefined)
    }
  }

  /** 在应用关闭时取消读取并等待线程释放，避免留下后台计算。 */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true
    for (const controller of this.active.keys()) {
      controller.abort(new Error('Application is shutting down'))
    }
    await Promise.all(this.active.values())
  }

  /** 逐块传送独占缓冲区并等待确认；任何失败均中断读取，完成后核对线程实际处理字节数。 */
  private async calculateInWorker(input: HashInput, controller: AbortController): Promise<string> {
    const worker = new Worker(resolve(__dirname, 'sha256.worker.cjs'))
    const failed = this.deferred<never>()
    // 读取与线程退出可能先于下一次 await，提前登记拒绝处理以防未处理的 Promise。
    void failed.promise.catch(() => {})
    let body: Readable | undefined
    let failure: Error | undefined
    let rejectReply: ((cause: unknown) => void) | undefined

    /** 传播线程或超时失败，并中止尚未结束的 SDK 请求。 */
    const fail = (cause: Error) => {
      failure ??= cause
      failed.reject(failure)
      rejectReply?.(failure)
      if (!controller.signal.aborted) controller.abort(failure)
      body?.destroy()
    }
    /** 即使退出码为零，提前退出也不能当作成功摘要。 */
    const onExit = (code: number) => fail(new Error(`Hash worker exited before cleanup (${code})`))
    /** 将存储流错误与摘要程序错误区分，交给上传层映射可公开错误。 */
    const onReadError = (cause: Error) => fail(new StorageObjectReadError(cause))
    /** 将应用关闭或校验超时传播到所有正在等待的阶段。 */
    const onAbort = () => fail(controller.signal.reason)
    worker.once('error', fail)
    worker.once('exit', onExit)
    controller.signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(
      () => fail(new AppException(UPLOAD_ERRORS.VERIFICATION_TIMEOUT)),
      HASH_TIMEOUT_MS,
    )
    timer.unref()

    /** 单次只允许一个未确认消息；读取、线程或超时失败时解除消息监听。 */
    const exchange = async (message: unknown, transfer: ArrayBuffer[] = []): Promise<unknown> => {
      if (failure) throw failure
      const reply = this.deferred<unknown>()
      rejectReply = reply.reject
      worker.once('message', reply.resolve)
      try {
        worker.postMessage(message, transfer)
        // 每块只保留当前等待者，避免对永久 pending 的失败 Promise 反复 race，随文件大小积累回调。
        return await reply.promise
      } finally {
        rejectReply = undefined
        worker.off('message', reply.resolve)
      }
    }

    try {
      const opening = input.openStream(controller.signal).then((stream) => {
        if (controller.signal.aborted) stream.destroy()
        return stream
      })
      body = await Promise.race([opening, failed.promise])
      body.once('error', onReadError)
      let byteLength = 0
      for await (const chunk of body) {
        if (!(chunk instanceof Uint8Array)) throw new TypeError('Expected a binary object stream')
        byteLength += chunk.byteLength
        if (byteLength > input.expectedSize) {
          throw new AppException(UPLOAD_ERRORS.OBJECT_VERIFICATION_FAILED)
        }
        for (let offset = 0; offset < chunk.byteLength; offset += HASH_CHUNK_SIZE) {
          // 不能转移池化 Buffer 的底层内存：复制当前片段到独占 ArrayBuffer。
          const bytes = new Uint8Array(chunk.subarray(offset, offset + HASH_CHUNK_SIZE))
          const response = await exchange({ type: 'update', chunk: bytes }, [bytes.buffer])
          if (
            !response ||
            typeof response !== 'object' ||
            !('type' in response) ||
            response.type !== 'updated'
          ) {
            throw new Error('Invalid hash worker acknowledgement')
          }
        }
      }
      if (byteLength !== input.expectedSize) {
        throw new AppException(UPLOAD_ERRORS.OBJECT_VERIFICATION_FAILED)
      }

      const response = await exchange({ type: 'digest' })
      if (
        !response ||
        typeof response !== 'object' ||
        !('sha256' in response) ||
        typeof response.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(response.sha256) ||
        !('byteLength' in response) ||
        response.byteLength !== byteLength
      ) {
        throw new Error('Invalid hash worker digest')
      }
      return response.sha256
    } catch (cause: unknown) {
      // 销毁流可能产生 PrematureClose，优先保留触发销毁的超时、线程或读取错误。
      if (controller.signal.aborted) throw controller.signal.reason
      throw cause
    } finally {
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', onAbort)
      controller.abort()
      body?.destroy()
      worker.off('error', fail)
      worker.off('exit', onExit)
      await worker.terminate()
      body?.off('error', onReadError)
    }
  }
}
