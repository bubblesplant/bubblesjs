import { AppException } from '@/common/exceptions/app.exception'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'
import type { InitiateMultipartUploadRequest } from 'shared/types'
import { ContentHashService } from './hash/content-hash.service'
import { ExactSizeTransform, findExactSizeError } from './storage/exact-size.transform'
import {
  MultipartIdentity,
  STORAGE_PORT,
  StorageMultipartNotFoundError,
  StorageObjectChangedError,
  StorageObjectReadError,
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
  private readonly completionRecovery = new Map<string, Promise<UploadSession | null>>()
  @Inject(ContentHashService)
  private readonly contentHash!: ContentHashService

  /**
   * 读取上传目标桶及会话有效期，并注入上传记录与对象存储依赖。
   */
  constructor(
    private readonly uploadRepository: UploadRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    config: ConfigService,
  ) {
    this.bucket = config.getOrThrow<string>('storage.bucket')
    this.sessionTtlMs = config.getOrThrow<number>('storage.sessionTtlMs')
  }

  /**
   * 幂等创建分片上传会话与存储 UploadId；并发请求复用已创建会话，多余存储上传会被补偿取消。
   * @param ownerId 上传所属用户 ID。
   * @param input 文件元数据及客户端生成的上传标识。
   * @returns 上传会话状态及已有分片信息。
   */
  async initiate(ownerId: string, input: InitiateMultipartUploadRequest) {
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

  /**
   * 拒绝空文件及超过上传大小上限的文件。
   * @param fileSize 文件字节数。
   */
  private validateNewFile(fileSize: number) {
    if (fileSize === 0) {
      throw new AppException(UPLOAD_ERRORS.FILE_EMPTY)
    }

    if (fileSize > UPLOAD_MAX_FILE_SIZE) {
      throw new AppException(UPLOAD_ERRORS.FILE_TOO_LARGE)
    }
  }

  /**
   * 检查同一客户端上传标识对应的名称、大小及内容类型一致，防止误复用其他文件会话。
   */
  private assertSameClientFile(
    session: UploadSession,
    input: InitiateMultipartUploadRequest,
  ): void {
    if (
      session.originalName !== input.fileName.trim() ||
      session.fileSize !== input.fileSize ||
      session.contentType !== input.contentType.trim()
    ) {
      throw new AppException(UPLOAD_ERRORS.CLIENT_UPLOAD_ID_CONFLICT)
    }
  }

  /**
   * 按用户归属读取上传会话，避免跨用户访问。
   * @throws 当前用户下找不到会话时抛出会话不存在错误。
   */
  private async requireSession(ownerId: string, uploadSessionId: string): Promise<UploadSession> {
    const session = await this.uploadRepository.findById(ownerId, uploadSessionId)

    if (!session) {
      throw new AppException(UPLOAD_ERRORS.SESSION_NOT_FOUND)
    }

    return session
  }

  /**
   * 尽力取消多余或过期的存储分片上传，失败只记录警告，保留主流程的原始结果。
   */
  private async safeAbort(identity: MultipartIdentity): Promise<void> {
    try {
      await this.storage.abortMultipartUpload(identity)
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause)
      this.logger.warn(`Compensating AbortMultipartUpload failed: ${message}`)
    }
  }
  /**
   * 从数据库上传会话提取对象存储定位所需的桶、对象键和 UploadId。
   */
  private toMultipartIdentity(session: UploadSession): MultipartIdentity {
    return {
      bucket: session.bucket,
      objectKey: session.objectKey,
      storageUploadId: session.storageUploadId,
    }
  }

  /**
   * 检查上传期限；到期时标记会话过期并尽力清理存储分片。
   * @throws 会话已到期时抛出上传过期错误。
   */
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

  /**
   * 沿最多八层 cause 链识别请求取消错误，兼容 SDK 对 AbortError 的包装。
   */
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

  /**
   * 在对象存储调用边界区分分片长度错误、上传丢失和取消，将其他失败转换为存储不可用。
   */
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

      if (cause instanceof StorageObjectChangedError) {
        throw new AppException(UPLOAD_ERRORS.OBJECT_VERIFICATION_FAILED)
      }

      if (this.isAbortError(cause)) {
        throw new AppException(UPLOAD_ERRORS.PART_UPLOAD_ABORTED)
      }

      throw new AppException(UPLOAD_ERRORS.STORAGE_UNAVAILABLE, { cause })
    }
  }

  /**
   * 同一进程中共享会话的对象校验，避免完成重试和状态查询重复读取大文件。
   * @returns 恢复或已完成的上传记录，无法确认对象完成时返回 null。
   */
  private recoverCompletedObject(session: UploadSession): Promise<UploadSession | null> {
    const existing = this.completionRecovery.get(session.id)
    if (existing) return existing
    const recovery = this.verifyCompletedObject(session).finally(() => {
      this.completionRecovery.delete(session.id)
    })
    this.completionRecovery.set(session.id, recovery)
    return recovery
  }

  /** 固定候选对象身份，读取完整内容并校验实际字节数，成功后才原子保存摘要与完成状态。 */
  private async verifyCompletedObject(session: UploadSession): Promise<UploadSession | null> {
    const object = await this.callStorage(() =>
      this.storage.headObject({
        bucket: session.bucket,
        objectKey: session.objectKey,
      }),
    )

    if (!object) return null
    if (
      !object.etag ||
      object.metadata['upload-session-id'] !== session.id ||
      object.metadata['owner-id'] !== session.ownerId ||
      object.contentLength !== session.fileSize
    ) {
      throw new AppException(UPLOAD_ERRORS.OBJECT_VERIFICATION_FAILED)
    }

    const etag = object.etag
    let objectSha256: string
    try {
      objectSha256 = await this.contentHash.calculate({
        expectedSize: session.fileSize,
        openStream: async (abortSignal) => {
          const result = await this.callStorage(() =>
            this.storage.getObject({
              bucket: session.bucket,
              objectKey: session.objectKey,
              ifMatch: etag,
              abortSignal,
            }),
          )
          if (
            result.etag !== etag ||
            result.contentLength !== session.fileSize ||
            result.metadata['upload-session-id'] !== session.id ||
            result.metadata['owner-id'] !== session.ownerId
          ) {
            result.body.destroy()
            throw new AppException(UPLOAD_ERRORS.OBJECT_VERIFICATION_FAILED)
          }
          return result.body
        },
      })
    } catch (cause: unknown) {
      if (cause instanceof StorageObjectReadError) {
        throw new AppException(UPLOAD_ERRORS.STORAGE_UNAVAILABLE, { cause })
      }
      throw cause
    }
    const updated = await this.uploadRepository.markCompleted({
      ownerId: session.ownerId,
      uploadSessionId: session.id,
      objectEtag: etag,
      objectSha256,
    })

    if (updated) {
      return updated
    }

    const latest = await this.uploadRepository.findById(session.ownerId, session.id)

    return latest?.status === 'completed' ? latest : null
  }

  /**
   * 将数据库会话及存储分片转换为客户端状态，日期统一输出为 ISO 字符串。
   */
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

  /**
   * 读取上传状态，处理过期并尝试可信恢复；completing 不再查询可能已消失的分片上传。
   */
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

    if (session.status !== 'uploading') {
      return this.toStatusResponse(session, [])
    }

    const parts = await this.callStorage(() =>
      this.storage.listParts(this.toMultipartIdentity(session)),
    )
    return this.toStatusResponse(session, parts)
  }

  /**
   * 按客户端上传标识幂等创建分片会话，写库失败或并发冲突时补偿取消新建存储上传。
   * @returns 可恢复上传的会话状态及已有分片信息。
   */
  async initate(
    ownerId: string,
    input: InitiateMultipartUploadRequest,
  ): Promise<UploadStatusResponse> {
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

  /**
   * 将 Content-Length 转换为正安全整数。
   * @throws 请求头缺失或无法表示有效分片长度时抛出长度必填错误。
   */
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

  /**
   * 校验会话归属、状态、分片序号和字节数后，将受长度约束的请求流写入对象存储。
   * @param input 包含请求体、声明长度和取消信号的分片上传命令。
   * @returns 上传分片的序号、字节数和 ETag。
   * @remarks 失败或结束时解除管道及监听器，必要时排空剩余请求字节。
   */
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
    /**
     * 将请求体错误传递给长度校验流，使下游存储上传及时失败。
     */
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

  /**
   * 从已完成的上传记录生成客户端所需的对象键与 ETag。
   */
  private toCompletedResponse(session: UploadSession): CompletedUploadResponse {
    return {
      uploadSessionId: session.id,
      status: 'completed',
      objectKey: session.objectKey,
      etag: session.objectEtag,
    }
  }

  /**
   * 检查分片数量、连续序号、ETag 和每片长度，确保总字节数与原文件完全一致。
   * @throws 分片缺失或大小不匹配时抛出分片不完整错误。
   */
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

  /**
   * 抢占完成状态后合并分片，完整校验对象并持久化 SHA-256；重复调用复用完成结果。
   * @remarks 合并尚未发出时可回退上传状态；发出后无法确认结果时保留 completing 并尝试对象探测恢复。
   */
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
    let verificationStarted = false

    try {
      const parts = await this.callStorage(() =>
        this.storage.listParts(this.toMultipartIdentity(claimed)),
      )

      this.assertCompleteParts(claimed, parts)

      completeWasAttempted = true
      await this.callStorage(() =>
        this.storage.completeMultipartUpload({
          ...this.toMultipartIdentity(claimed),
          parts,
        }),
      )

      verificationStarted = true
      const verified = await this.recoverCompletedObject(claimed)
      if (!verified) throw new Error('Completed object could not be verified or persisted')
      return this.toCompletedResponse(verified)
    } catch (cause: unknown) {
      // 摘要或写库失败留给下一次请求恢复，避免本次请求重复全量读取。
      if (verificationStarted) throw cause
      if (!completeWasAttempted) {
        if (
          cause instanceof AppException &&
          cause.definition.code === UPLOAD_ERRORS.STORAGE_UPLOAD_MISSING.code
        ) {
          // UploadId 已经不存在，不能确定是外部清理还是曾经完成过。
          // 先尝试 HeadObject；仍无法恢复时不重新开放上传，交给后台清理流程判定。
          const recovered = await this.recoverCompletedObject(claimed)

          if (recovered) {
            return this.toCompletedResponse(recovered)
          }

          throw cause
        }

        // ListParts 失败或分片不完整时还没有发送 Complete，
        // 因此可以安全恢复为 uploading，让调用方修正后重试。
        await this.uploadRepository.resetCompleting(ownerId, uploadSessionId)
        throw cause
      }

      const recovered = await this.recoverCompletedObject(claimed)

      if (recovered) {
        return this.toCompletedResponse(recovered)
      }

      // Complete 已经发出后，即使 HeadObject 暂时还看不到对象，也不能证明
      // MinIO 没有完成。保持 completing，由 GET 状态恢复或后台任务继续判定。
      throw cause
    }
  }

  /**
   * 抢占取消状态、清理存储分片并记录取消结果；已取消会话可重复调用。
   * @throws 已完成或正在完成的会话不允许取消。
   */
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
