import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Readable } from 'node:stream'
import {
  CreateMultipartInput,
  MultipartIdentity,
  ReadObjectInput,
  StorageObjectChangedError,
  StorageMultipartNotFoundError,
  StorageObject,
  StorageObjectStream,
  StoragePart,
  StoragePort,
  UploadPartInput,
} from './storage.port'

/**
 * 兼容 AWS SDK 的 name 与 S3 响应的 Code 字段，判断存储错误类别。
 */
function hasErrorName(cause: unknown, expected: string): boolean {
  if (typeof cause !== 'object' || cause === null) {
    return false
  }
  const record = cause as { name?: unknown; Code?: unknown }
  return record.name === expected || record.Code === expected
}

/**
 * 将 NoSuchUpload 转换为存储端口约定的异常，其余错误保留原始原因并抛出。
 */
function throwMappedMultipartError(cause: unknown): never {
  if (hasErrorName(cause, 'NoSuchUpload')) {
    throw new StorageMultipartNotFoundError(cause)
  }

  throw cause
}

@Injectable()
export class MinioStorageAdapter implements StoragePort, OnModuleDestroy {
  private readonly client: S3Client
  private readonly bucket: string

  /** 以条件 GET 打开完整对象流，固定探测的 ETag，避免校验时读取被覆盖的内容。 */
  async getObject(input: ReadObjectInput): Promise<StorageObjectStream> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          IfMatch: input.ifMatch,
        }),
        { abortSignal: input.abortSignal },
      )
      if (!(response.Body instanceof Readable)) {
        throw new TypeError('Object storage did not return a Node readable stream')
      }
      return {
        body: response.Body,
        etag: response.ETag ?? null,
        contentLength: response.ContentLength ?? null,
        metadata: response.Metadata ?? {},
      }
    } catch (cause: unknown) {
      if (hasErrorName(cause, 'PreconditionFailed')) {
        throw new StorageObjectChangedError(cause)
      }
      throw cause
    }
  }

  /**
   * 根据存储配置创建 S3 客户端，并禁用不可回放上传流的自动重试。
   */
  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('storage.bucket')
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('storage.endpoint'),
      region: config.getOrThrow<string>('storage.region'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('storage.accessKeyId'),
        secretAccessKey: config.getOrThrow<string>('storage.secretAccessKey'),
      },
      forcePathStyle: config.getOrThrow<boolean>('storage.forcePathStyle'),
      // UploadPart 的 Body 是不可回放流，禁止 SDK 在后端自动重放。
      maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  /**
   * 通过 HeadBucket 验证目标桶存在且可访问，失败交由调用方处理。
   */
  private async assertBucketAvailable(): Promise<void> {
    await this.client.send(
      new HeadBucketCommand({
        Bucket: this.bucket,
      }),
    )
  }

  /**
   * 在模块销毁时释放 S3 客户端的网络资源。
   */
  onModuleDestroy() {
    this.client.destroy()
  }

  /**
   * 在模块初始化时探测上传桶，及早暴露配置或存储访问异常。
   */
  async onModuleInit() {
    await this.assertBucketAvailable()
  }

  /**
   * 向对象存储创建分片上传，写入内容类型和元数据并返回 UploadId。
   * @throws 存储未返回 UploadId 时抛出错误。
   */
  async createMultipartUpload(input: CreateMultipartInput) {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    )

    if (!response.UploadId) {
      throw new Error('Storage did not return an UploadId')
    }

    return {
      storageUploadId: response.UploadId,
    }
  }

  /**
   * 流式上传指定分片并传递取消信号，返回后续合并所需的 ETag。
   */
  async uploadPart(input: UploadPartInput) {
    try {
      const response = await this.client.send(
        new UploadPartCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          UploadId: input.storageUploadId,
          PartNumber: input.partNumber,
          Body: input.body,
          ContentLength: input.contentLength,
        }),
        {
          abortSignal: input.abortSignal,
        },
      )

      if (!response.ETag) {
        throw new Error('Storage did not return an ETag')
      }

      return {
        etag: response.ETag,
      }
    } catch (cause: unknown) {
      throwMappedMultipartError(cause)
    }
  }

  /**
   * 逐页读取全部已上传分片，校验记录与游标有效性，并按分片序号升序返回。
   */
  async listParts(input: MultipartIdentity): Promise<StoragePart[]> {
    const parts: StoragePart[] = []
    let partNumberMarker: string | undefined
    try {
      for (;;) {
        const response = await this.client.send(
          new ListPartsCommand({
            Bucket: input.bucket,
            Key: input.objectKey,
            UploadId: input.storageUploadId,
            PartNumberMarker: partNumberMarker,
          }),
        )

        for (const part of response.Parts ?? []) {
          if (part.PartNumber === undefined || part.ETag === undefined || part.Size === undefined) {
            throw new Error('Storage returned an incomplete part record')
          }
          parts.push({
            partNumber: part.PartNumber,
            etag: part.ETag,
            size: part.Size,
          })
        }

        if (!response.IsTruncated) {
          break
        }

        const nextMarker = response.NextPartNumberMarker
        if (!nextMarker || nextMarker === partNumberMarker) {
          throw new Error('Storage returned an invalid ListParts cursor')
        }

        partNumberMarker = nextMarker
      }
    } catch (cause: unknown) {
      throwMappedMultipartError(cause)
    }

    return parts.sort((left, right) => left.partNumber - right.partNumber)
  }

  /**
   * 提交分片序号和 ETag 列表完成对象合并，返回存储对象的 ETag。
   */
  async completeMultipartUpload(input: MultipartIdentity & { parts: readonly StoragePart[] }) {
    try {
      const response = await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          UploadId: input.storageUploadId,
          MultipartUpload: {
            Parts: input.parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
            })),
          },
        }),
      )
      return {
        etag: response.ETag ?? null,
      }
    } catch (cause: unknown) {
      throwMappedMultipartError(cause)
    }
  }

  /**
   * 取消对象存储中的分片上传；UploadId 已不存在时视为成功，保持取消操作幂等。
   */
  async abortMultipartUpload(input: MultipartIdentity): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          UploadId: input.storageUploadId,
        }),
      )
    } catch (cause: unknown) {
      if (hasErrorName(cause, 'NoSuchUpload')) {
        return
      }
      throw cause
    }
  }

  /**
   * 读取对象大小、ETag 及元数据；确认仅对象缺失时返回 null，桶不可用时仍抛出错误。
   */
  async headObject(input: { bucket: string; objectKey: string }): Promise<StorageObject | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
        }),
      )
      return {
        etag: response.ETag ?? null,
        contentLength: response.ContentLength ?? null,
        metadata: response.Metadata ?? {},
      }
    } catch (cause: unknown) {
      if (hasErrorName(cause, 'NoSuchBucket')) {
        throw cause
      }

      if (hasErrorName(cause, 'NoSuchKey')) {
        return null
      }

      if (hasErrorName(cause, 'NotFound')) {
        // 某些 S3 兼容实现会把“对象不存在”和“Bucket 不存在”都表示成 404。
        // 额外探测 Bucket；只有 Bucket 确实可用时，才把这次 404 当成对象不存在。
        await this.assertBucketAvailable()
        return null
      }

      throw cause
    }
  }
}
