import { Readable } from 'stream'

export const STORAGE_PORT = Symbol('STORAGE_PORT')

export class StorageObjectChangedError extends Error {
  /** 对象在探测与读取间发生变化，不能复用该次验证身份。 */
  constructor(cause: unknown) {
    super('Object changed before verification', { cause })
    this.name = StorageObjectChangedError.name
  }
}

export class StorageObjectReadError extends Error {
  /** 保留完整对象读取失败的原因，避免将线程或数据库错误误报为存储不可用。 */
  constructor(cause: unknown) {
    super('Failed to read object stream', { cause })
    this.name = StorageObjectReadError.name
  }
}

export interface ReadObjectInput {
  bucket: string
  objectKey: string
  ifMatch: string
  abortSignal: AbortSignal
}

export interface StorageObjectStream extends StorageObject {
  body: Readable
}

export class StorageMultipartNotFoundError extends Error {
  /**
   * 封装存储分片上传不存在的错误，并保留原始原因供上层映射和排查。
   */
  constructor(cause: unknown) {
    super('Multipart upload does not exist', { cause })
    this.name = StorageMultipartNotFoundError.name
  }
}

export interface CreateMultipartInput {
  bucket: string
  objectKey: string
  contentType: string
  metadata: Record<string, string>
}

export interface UploadPartInput {
  bucket: string
  objectKey: string
  storageUploadId: string
  partNumber: number
  body: Readable
  contentLength: number
  abortSignal?: AbortSignal
}

export interface MultipartIdentity {
  bucket: string
  objectKey: string
  storageUploadId: string
}

export interface StoragePart {
  partNumber: number
  etag: string
  size: number
}

export interface StorageObject {
  etag: string | null
  contentLength: number | null
  metadata: Record<string, string>
}

export interface StoragePort {
  /**
   * 在指定桶创建分片上传并返回后续请求使用的存储 UploadId。
   */
  createMultipartUpload(input: CreateMultipartInput): Promise<{ storageUploadId: string }>

  /**
   * 写入指定序号的分片流，支持取消信号，并返回合并所需的 ETag。
   */
  uploadPart(input: UploadPartInput): Promise<{ etag: string }>

  /**
   * 返回按序号排列的全部已上传分片，供续传和完整性校验使用。
   */
  listParts(input: MultipartIdentity): Promise<StoragePart[]>

  /**
   * 按已校验的分片列表合并对象，返回对象 ETag。
   */
  completeMultipartUpload(
    input: MultipartIdentity & { parts: readonly StoragePart[] },
  ): Promise<{ etag: string | null }>

  /**
   * 清理指定上传的未合并分片，重复取消应保持幂等。
   */
  abortMultipartUpload(input: MultipartIdentity): Promise<void>

  /**
   * 读取对象的长度、ETag 和元数据；对象不存在时返回 null。
   */
  headObject(input: { bucket: string; objectKey: string }): Promise<StorageObject | null>

  /** 以 ETag 条件读取完整二进制流；调用方负责消费或销毁，不聚合整个对象。 */
  getObject(input: ReadObjectInput): Promise<StorageObjectStream>
}
