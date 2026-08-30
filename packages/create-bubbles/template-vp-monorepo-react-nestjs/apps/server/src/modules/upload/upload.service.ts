import { AppException } from '@/common/exceptions/app.exception'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { InitiateMultipartUploadDto } from './dto/initiate-mutipart-upload.dto'
import { findExactSizeError } from './storage/exact-size.transform'
import {
  MultipartIdentity,
  STORAGE_PORT,
  StorageMultipartNotFoundError,
  StoragePart,
  type StoragePort,
} from './storage/storage.port'
import {
  calculateTotalParts,
  UPLOAD_MAX_FILE_SIZE,
  UPLOAD_MAX_PARTS,
  UPLOAD_PART_SIZE,
} from './upload.constants'
import { UPLOAD_ERRORS } from './upload.errors'
import { UploadRepository, UploadSession } from './upload.reponsitory'
import { buildUploadObjectKey } from './utils/object-key'

export interface UploadedPartResponse {
  partNumber: number
  size: number
  etag: string
}

export interface UploadStatusResponse {
  uploadSessionId: string
  fileName: string
  fileSize: number
  contentType: string
  partSize: number
  totalParts: number
  status: UploadSession['status']
  expiresAt: string
  uploadedParts: UploadedPartResponse[]
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name)
  private readonly bucket: string
  private readonly sessionTtlMs: number

  constructor(
    private readonly uploadRepository: UploadRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    config: ConfigService,
  ) {
    this.bucket = config.getOrThrow<string>('storage.bucket')
    this.sessionTtlMs = config.getOrThrow<number>('storage.sessionTtlMs')
  }

  private validateNewFile(fileSize: number) {
    if (fileSize === 0) {
      throw new AppException(UPLOAD_ERRORS.FILE_EMPTY)
    }

    if (fileSize > UPLOAD_MAX_FILE_SIZE) {
      throw new AppException(UPLOAD_ERRORS.FILE_TOO_LARGE)
    }
  }

  private assertSameClientFile(session: UploadSession, input: InitiateMultipartUploadDto): void {
    if (
      session.originalName !== input.fileName.trim() ||
      session.fileSize !== input.fileSize ||
      session.contentType !== input.contentType.trim()
    ) {
      throw new AppException(UPLOAD_ERRORS.CLIENT_UPLOAD_ID_CONFLICT)
    }
  }

  private async requireSession(ownerId: string, uploadSessionId: string): Promise<UploadSession> {
    const session = await this.uploadRepository.findById(ownerId, uploadSessionId)

    if (!session) {
      throw new AppException(UPLOAD_ERRORS.SESSION_NOT_FOUND)
    }

    return session
  }

  private async safeAbort(identity: MultipartIdentity): Promise<void> {
    try {
      await this.storage.abortMultipartUpload(identity)
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause)
      this.logger.warn(`Compensating AbortMultipartUpload failed: ${message}`)
    }
  }
  private toMultipartIdentity(session: UploadSession): MultipartIdentity {
    return {
      bucket: session.bucket,
      objectKey: session.objectKey,
      storageUploadId: session.storageUploadId,
    }
  }

  private async ensureNotExpired(session: UploadSession): Promise<void> {
    if (session.expiresAt.getTime() > Date.now()) {
      return
    }

    const expired = await this.uploadRepository.markExpired(session.ownerId, session.id)

    if (expired) {
      await this.safeAbort(this.toMultipartIdentity(expired))
    }

    throw new AppException(UPLOAD_ERRORS.UPLOAD_EXPIRED)
  }

  private isAbortError(cause: unknown): boolean {
    let current = cause

    for (let depth = 0; depth < 8; depth += 1) {
      if (
        typeof current === 'object' &&
        current !== null &&
        'name' in current &&
        current.name === 'AbortError'
      ) {
        return true
      }

      if (typeof current !== 'object' || current === null || !('cause' in current)) {
        return false
      }

      current = current.cause
    }

    return false
  }

  private async callStorage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (cause: unknown) {
      if (cause instanceof AppException) {
        throw cause
      }

      if (findExactSizeError(cause)) {
        throw new AppException(UPLOAD_ERRORS.PART_SIZE_MISMATCH)
      }

      if (cause instanceof StorageMultipartNotFoundError) {
        throw new AppException(UPLOAD_ERRORS.STORAGE_UPLOAD_MISSING)
      }

      if (this.isAbortError(cause)) {
        throw new AppException(UPLOAD_ERRORS.PART_UPLOAD_ABORTED)
      }

      throw new AppException(UPLOAD_ERRORS.STORAGE_UNAVAILABLE, { cause })
    }
  }

  private async recoverCompletedObject(session: UploadSession): Promise<UploadSession | null> {
    const object = await this.callStorage(() =>
      this.storage.headObject({
        bucket: session.bucket,
        objectKey: session.objectKey,
      }),
    )

    if (
      !object ||
      object.metadata['upload-session-id'] !== session.id ||
      object.contentLength !== session.fileSize
    ) {
      return null
    }

    const updated = await this.uploadRepository.markCompleted(
      session.ownerId,
      session.id,
      object.etag,
    )

    if (updated) {
      return updated
    }

    const latest = await this.uploadRepository.findById(session.ownerId, session.id)

    return latest?.status === 'completed' ? latest : null
  }

  private toStatusResponse(
    session: UploadSession,
    parts: readonly StoragePart[],
  ): UploadStatusResponse {
    return {
      uploadSessionId: session.id,
      fileName: session.originalName,
      fileSize: session.fileSize,
      contentType: session.contentType,
      partSize: session.partSize,
      totalParts: session.totalParts,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
      uploadedParts: parts.map((part) => ({
        partNumber: part.partNumber,
        size: part.size,
        etag: part.etag,
      })),
    }
  }

  async getStatus(ownerId: string, uploadSessionId: string): Promise<UploadStatusResponse> {
    let session = await this.requireSession(ownerId, uploadSessionId)

    if (session.status === 'expired') {
      throw new AppException(UPLOAD_ERRORS.UPLOAD_EXPIRED)
    }

    if (session.status === 'uploading') {
      await this.ensureNotExpired(session)
    }

    if (session.status === 'completing') {
      const recovered = await this.recoverCompletedObject(session)

      if (recovered) {
        session = recovered
      }
    }

    if (session.status !== 'uploading' && session.status !== 'completing') {
      return this.toStatusResponse(session, [])
    }

    const parts = await this.callStorage(() =>
      this.storage.listParts(this.toMultipartIdentity(session)),
    )
    return this.toStatusResponse(session, parts)
  }

  async initate(ownerId: string, input: InitiateMultipartUploadDto): Promise<UploadStatusResponse> {
    this.validateNewFile(input.fileSize)

    const existing = await this.uploadRepository.findByClientUploadId(ownerId, input.clientUploadId)

    if (existing) {
      this.assertSameClientFile(existing, input)
      return this.getStatus(ownerId, existing.id)
    }

    const totalParts = calculateTotalParts(input.fileSize)

    if (totalParts > UPLOAD_MAX_PARTS) {
      throw new AppException(UPLOAD_ERRORS.FILE_TOO_LARGE)
    }

    const uploadSessionId = randomUUID()
    const objectKey = buildUploadObjectKey(ownerId, uploadSessionId)

    const storageResult = await this.callStorage(() =>
      this.storage.createMultipartUpload({
        bucket: this.bucket,
        objectKey,
        contentType: input.contentType.trim(),
        metadata: {
          'upload-session-id': uploadSessionId,
          'owner-id': ownerId,
        },
      }),
    )

    const identity: MultipartIdentity = {
      bucket: this.bucket,
      objectKey,
      storageUploadId: storageResult.storageUploadId,
    }

    try {
      const created = await this.uploadRepository.create({
        id: uploadSessionId,
        ownerId,
        clientUploadId: input.clientUploadId,
        bucket: this.bucket,
        objectKey,
        storageUploadId: storageResult.storageUploadId,
        originalName: input.fileName.trim(),
        contentType: input.contentType.trim(),
        fileSize: input.fileSize,
        partSize: UPLOAD_PART_SIZE,
        totalParts,
        status: 'uploading',
        expiresAt: new Date(Date.now() + this.sessionTtlMs),
      })

      if (created) {
        return this.toStatusResponse(created, [])
      }

      const winner = await this.uploadRepository.findByClientUploadId(ownerId, input.clientUploadId)

      await this.safeAbort(identity)

      if (!winner) {
        throw new Error('Upload session conflict winner was not found')
      }

      this.assertSameClientFile(winner, input)
      return this.getStatus(ownerId, winner.id)
    } catch (cause: unknown) {
      await this.safeAbort(identity)
      throw cause
    }
  }
}
