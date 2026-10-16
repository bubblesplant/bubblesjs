import type { FileHashWorkerRequest, FileHashWorkerResponse } from 'shared/types'
import { calculateBlobSha256 } from 'shared/utils/file-hash'

// 使用精确的消息接口，避免在 DOM 项目中混入整套 WebWorker 全局声明。
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<FileHashWorkerRequest>) => void) | null
  postMessage: (message: FileHashWorkerResponse) => void
}

/** 单文件摘要的进度和终态只通过结构化消息返回，原始字节留在线程内。 */
async function hashFile({ file, chunkSize }: FileHashWorkerRequest): Promise<void> {
  try {
    const sha256 = await calculateBlobSha256({
      file,
      chunkSize,
      onProgress: (progress) => scope.postMessage({ type: 'progress', progress }),
    })
    scope.postMessage({ type: 'complete', sha256 })
  } catch (error) {
    scope.postMessage({
      type: 'error',
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : '文件摘要计算失败',
    })
  }
}

scope.onmessage = (event) => {
  scope.onmessage = null
  void hashFile(event.data)
}
