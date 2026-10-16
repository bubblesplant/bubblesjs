/** 已输入摘要实例的字节进度，不表示上传进度。 */
export interface FileHashProgress {
  processedBytes: number
  totalBytes: number
}

/** 本地完整内容摘要的选项；chunkSize 独立于上传分片大小。 */
export interface FileHashOptions {
  file: Blob
  signal?: AbortSignal
  onProgress?: (progress: FileHashProgress) => void
  /** 每次读取字节数，默认 4 MiB，最大 16 MiB。 */
  chunkSize?: number
}

/** Worker 每个实例只接收一个文件，取消由主线程 terminate 执行。 */
export interface FileHashWorkerRequest {
  file: Blob
  chunkSize?: number
}

/** 不跨线程发送回调、AbortSignal 或原生 Error 对象。 */
export type FileHashWorkerResponse =
  | { type: 'progress'; progress: FileHashProgress }
  | { type: 'complete'; sha256: string }
  | { type: 'error'; name: string; message: string }
