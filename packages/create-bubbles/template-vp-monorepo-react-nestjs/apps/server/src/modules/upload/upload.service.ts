import { AppException } from '@/common/exceptions/app.exception'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'
import { InitiateMultipartUploadDto } from './dto/initiate-mutipart-upload.dto'
import { ExactSizeTransform, findExactSizeError } from './storage/exact-size.transform'
import {
  MultipartIdentity,
  STORAGE_PORT,
  StorageMultipartNotFoundError,
  StoragePart,
  type StoragePort,
} from './storage/storage.port'
import {
  calculateExpectedPartSize,
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

interface UploadPartCommandInput {
  ownerId: string
  uploadSessionId: string
  partNumber: number
  contentLength: string | undefined
  contentEncoding: string | undefined
  body: Readable
  abortSignal: AbortSignal
}

export interface CompletedUploadResponse {
  uploadSessionId: string
  status: 'completed'
  objectKey: string
  etag: string | null
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

  async initiate(ownerId: string, input: InitiateMultipartUploadDto) {
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

  private parseContentLength(value: string | undefined): number {
    if (!value) {
      throw new AppException(UPLOAD_ERRORS.PART_LENGTH_REQUIRED)
    }
    const parsed = Number(value)

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new AppException(UPLOAD_ERRORS.PART_LENGTH_REQUIRED)
    }

    return parsed
  }

  async uploadPart(input: UploadPartCommandInput) {
    const session = await this.requireSession(input.ownerId, input.uploadSessionId)

    if (session.status !== 'uploading') {
      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    await this.ensureNotExpired(session)

    if (input.partNumber < 1 || input.partNumber > session.totalParts) {
      throw new AppException(UPLOAD_ERRORS.PART_NUMBER_INVALID)
    }

    if (input.contentEncoding && input.contentEncoding.toLowerCase() !== 'identity') {
      throw new AppException(UPLOAD_ERRORS.UNSUPPORTED_CONTENT_ENCODING)
    }

    const expectedSize = calculateExpectedPartSize(
      session.fileSize,
      session.totalParts,
      input.partNumber,
    )

    const declaredSize = this.parseContentLength(input.contentLength)

    if (declaredSize !== expectedSize) {
      throw new AppException(UPLOAD_ERRORS.PART_SIZE_MISMATCH)
    }

    const exactSizeStream = new ExactSizeTransform(expectedSize)
    const onSourceError = (cause: Error) => exactSizeStream.destroy(cause)
    input.body.once('error', onSourceError)

    try {
      const guardedBody = input.body.pipe(exactSizeStream)
      const result = await this.callStorage(() =>
        this.storage.uploadPart({
          ...this.toMultipartIdentity(session),
          partNumber: input.partNumber,
          body: guardedBody,
          contentLength: expectedSize,
          abortSignal: input.abortSignal,
        }),
      )

      return {
        partNumber: input.partNumber,
        size: expectedSize,
        etag: result.etag,
      }
    } catch (cause: unknown) {
      input.body.unpipe(exactSizeStream)
      exactSizeStream.destroy()

      if (!input.body.destroyed) {
        input.body.resume()
      }
      throw cause
    } finally {
      input.body.unpipe(exactSizeStream)
      input.body.off('error', onSourceError)

      if (!exactSizeStream.destroyed) {
        exactSizeStream.destroy()
      }
    }
  }

  private toCompletedResponse(session: UploadSession): CompletedUploadResponse {
    return {
      uploadSessionId: session.id,
      status: 'completed',
      objectKey: session.objectKey,
      etag: session.objectEtag,
    }
  }

  private assertCompleteParts(session: UploadSession, parts: readonly StoragePart[]): void {
    if (parts.length !== session.totalParts) {
      throw new AppException(UPLOAD_ERRORS.PARTS_INCOMPLETE)
    }

    let totalBytes = 0

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const expectedPartNumber = index + 1

      if (!part || part.partNumber !== expectedPartNumber || !part.etag) {
        throw new AppException(UPLOAD_ERRORS.PARTS_INCOMPLETE)
      }

      const expectedSize = calculateExpectedPartSize(
        session.fileSize,
        session.totalParts,
        expectedPartNumber,
      )

      if (part.size !== expectedSize) {
        throw new AppException(UPLOAD_ERRORS.PARTS_INCOMPLETE)
      }

      totalBytes += part.size
    }

    if (totalBytes !== session.fileSize) {
      throw new AppException(UPLOAD_ERRORS.PARTS_INCOMPLETE)
    }
  }

  async complete(ownerId: string, uploadSessionId: string): Promise<CompletedUploadResponse> {
    let session = await this.requireSession(ownerId, uploadSessionId)

    if (session.status === 'completed') {
      return this.toCompletedResponse(session)
    }

    if (session.status === 'completing') {
      const recovered = await this.recoverCompletedObject(session)

      if (recovered) {
        return this.toCompletedResponse(recovered)
      }

      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    if (session.status !== 'uploading') {
      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    // 从上传中 到 completing
    await this.ensureNotExpired(session)

    const claimed = await this.uploadRepository.claimCompleting(ownerId, uploadSessionId)

    if (!claimed) {
      session = await this.requireSession(ownerId, uploadSessionId)

      if (session.status === 'completed') {
        return this.toCompletedResponse(session)
      }

      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    let completeWasAttempted = false

    try {
      const parts = await this.callStorage(() =>
        this.storage.listParts(this.toMultipartIdentity(claimed)),
      )

      this.assertCompleteParts(claimed, parts)

      completeWasAttempted = true
      const completed = await this.callStorage(() =>
        this.storage.completeMultipartUpload({
          ...this.toMultipartIdentity(claimed),
          parts,
        }),
      )

      const updated = await this.uploadRepository.markCompleted(
        ownerId,
        uploadSessionId,
        completed.etag,
      )

      if (!updated) {
        const recovered = await this.recoverCompletedObject(claimed)

        if (recovered) {
          return this.toCompletedResponse(recovered)
        }

        throw new Error('Completed object could not be persisted')
      }

      return this.toCompletedResponse(updated)
    } catch (cause: unknown) {
      if (!completeWasAttempted) {
        if (
          cause instanceof AppException &&
          cause.definition.code === UPLOAD_ERRORS.STORAGE_UPLOAD_MISSING.code
        ) {
          // UploadId 已经不存在，不能确定是外部清理还是曾经完成过。
          // 先尝试 HeadObject；仍无法恢复时不重新开放上传，交给后台清理流程判定。
          try {
            const recovered = await this.recoverCompletedObject(claimed)

            if (recovered) {
              return this.toCompletedResponse(recovered)
            }
          } catch {
            // 保留原始 STORAGE_UPLOAD_MISSING 错误，并继续保持 completing。
          }

          throw cause
        }

        // ListParts 失败或分片不完整时还没有发送 Complete，
        // 因此可以安全恢复为 uploading，让调用方修正后重试。
        await this.uploadRepository.resetCompleting(ownerId, uploadSessionId)
        throw cause
      }

      try {
        const recovered = await this.recoverCompletedObject(claimed)

        if (recovered) {
          return this.toCompletedResponse(recovered)
        }
      } catch {
        // 无法确认 MinIO 是否已完成时保持 completing，
        // 避免错误地重新开放分片上传。
        throw cause
      }

      // Complete 已经发出后，即使 HeadObject 暂时还看不到对象，也不能证明
      // MinIO 没有完成。保持 completing，由 GET 状态恢复或后台任务继续判定。
      throw cause
    }
  }

  async abort(ownerId: string, uploadSessionId: string) {
    let session = await this.requireSession(ownerId, uploadSessionId)
    if (session.status === 'aborted') {
      return {
        uploadSessionId,
        status: 'aborted' as const,
      }
    }

    if (session.status === 'completed' || session.status === 'completing') {
      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    const claimed = await this.uploadRepository.claimAborting(ownerId, uploadSessionId)

    if (!claimed) {
      session = await this.requireSession(ownerId, uploadSessionId)

      if (session.status === 'aborted') {
        return {
          uploadSessionId,
          status: 'aborted' as const,
        }
      }

      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    await this.callStorage(() =>
      this.storage.abortMultipartUpload(this.toMultipartIdentity(claimed)),
    )

    const aborted = await this.uploadRepository.markAborted(ownerId, uploadSessionId)

    if (!aborted) {
      const latest = await this.uploadRepository.findById(ownerId, uploadSessionId)

      if (latest?.status === 'aborted') {
        return {
          uploadSessionId,
          status: 'aborted' as const,
        }
      }

      throw new Error('Aborted upload could not be persisted')
    }
  }
}
