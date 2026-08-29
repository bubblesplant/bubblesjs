import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CreateMultipartInput,
  MultipartIdentity,
  StorageMultipartNotFoundError,
  StorageObject,
  StoragePart,
  StoragePort,
  UploadPartInput,
} from './storage.port'

function hasErrorName(cause: unknown, expected: string): boolean {
  if (typeof cause !== 'object' || cause === null) {
    return false
  }
  const record = cause as { name?: unknown; Code?: unknown }
  return record.name === expected || record.Code === expected
}

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

  private async assertBucketAvailable(): Promise<void> {
    await this.client.send(
      new HeadBucketCommand({
        Bucket: this.bucket,
      }),
    )
  }

  onModuleDestroy() {
    this.client.destroy()
  }

  async onModuleInit() {
    await this.assertBucketAvailable()
  }

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
