import type { FileHashOptions, FileHashWorkerResponse } from 'shared/types'

import { acquireHashSlot } from './worker-slots'

/**
 * 在专用 Worker 中计算完整文件 SHA-256，最多两个并发，其余按序等待。
 * 支持等待／执行取消；所有结局都会释放线程、监听和名额，不回退主线程计算。
 */
export async function calculateFileSha256(options: FileHashOptions): Promise<string> {
  const release = await acquireHashSlot(options.signal)
  try {
    options.signal?.throwIfAborted()
    return await runWorker(options)
  } finally {
    release()
  }
}

/** 处理单文件的线程消息；进度回调异常也按任务失败清理。 */
function runWorker({ file, signal, onProgress, chunkSize }: FileHashOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sha256.worker.ts', import.meta.url), { type: 'module' })
    let settled = false

    /** 先释放运行资源，再发布结果，避免上层回调留下活动线程。 */
    const finish = (result: { sha256: string } | { error: unknown }) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      if ('error' in result) reject(result.error)
      else resolve(result.sha256)
    }

    const abort = () => finish({ error: signal?.reason })
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<FileHashWorkerResponse>) => {
      if (settled) return
      try {
        const message = event.data
        switch (message.type) {
          case 'progress':
            onProgress?.(message.progress)
            break
          case 'complete':
            finish({ sha256: message.sha256 })
            break
          case 'error': {
            const error = new Error(message.message)
            error.name = message.name
            finish({ error })
            break
          }
          default:
            finish({ error: new Error('摘要线程返回未知消息') })
        }
      } catch (error) {
        finish({ error })
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      finish({ error: new Error(event.message || '无法启动文件摘要线程') })
    }
    worker.onmessageerror = () => finish({ error: new Error('无法读取摘要线程消息') })
    try {
      worker.postMessage({ file, chunkSize })
    } catch (error) {
      finish({ error })
    }
  })
}
