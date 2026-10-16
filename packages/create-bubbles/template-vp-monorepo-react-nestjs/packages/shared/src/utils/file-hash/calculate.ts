import { createSHA256 } from 'hash-wasm'

import type { FileHashOptions } from '../../types/file-hash'

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024
const MAX_CHUNK_SIZE = 16 * 1024 * 1024
const PROGRESS_INTERVAL_MS = 100

/**
 * 顺序读取 Blob 并增量计算完整 SHA-256；浏览器调用方应放在 Worker 中执行。
 * 不缓存全部字节，读取失败或取消不返回部分摘要；进度回调错误向上传播。
 */
export async function calculateBlobSha256({
  file,
  signal,
  onProgress,
  chunkSize = DEFAULT_CHUNK_SIZE,
}: FileHashOptions): Promise<string> {
  signal?.throwIfAborted()
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
    throw new RangeError('摘要读取块大小必须为 1 字节至 16 MiB 的整数')
  }
  const totalBytes = file.size
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) {
    throw new RangeError('文件大小必须为非负安全整数')
  }

  const hasher = await createSHA256()
  signal?.throwIfAborted()
  hasher.init()
  let processedBytes = 0
  let lastProgressTime = performance.now()
  onProgress?.({ processedBytes, totalBytes })

  while (processedBytes < totalBytes) {
    signal?.throwIfAborted()
    const end = Math.min(processedBytes + chunkSize, totalBytes)
    const bytes = new Uint8Array(await file.slice(processedBytes, end).arrayBuffer())
    signal?.throwIfAborted()
    if (bytes.byteLength !== end - processedBytes) {
      throw new Error('文件读取长度与预期不一致')
    }
    hasher.update(bytes)
    processedBytes = end
    const now = performance.now()
    if (processedBytes === totalBytes || now - lastProgressTime >= PROGRESS_INTERVAL_MS) {
      onProgress?.({ processedBytes, totalBytes })
      lastProgressTime = now
    }
  }
  signal?.throwIfAborted()
  return hasher.digest('hex')
}
