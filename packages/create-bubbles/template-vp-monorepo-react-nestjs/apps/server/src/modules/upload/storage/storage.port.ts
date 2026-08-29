import { Readable } from 'stream'

export const STORAGE_PORT = Symbol('STORAGE_PORT')

export class StorageMultipartNotFoundError extends Error {
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
  createMultipartUpload(input: CreateMultipartInput): Promise<{ storageUploadId: string }>

  uploadPart(input: UploadPartInput): Promise<{ etag: string }>

  listParts(input: MultipartIdentity): Promise<StoragePart[]>

  completeMultipartUpload(
    input: MultipartIdentity & { parts: readonly StoragePart[] },
  ): Promise<{ etag: string | null }>

  abortMultipartUpload(input: MultipartIdentity): Promise<void>

  headObject(input: { bucket: string; objectKey: string }): Promise<StorageObject | null>
}
