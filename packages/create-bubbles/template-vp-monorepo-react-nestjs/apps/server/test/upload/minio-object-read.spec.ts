import 'reflect-metadata'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { MinioStorageAdapter } from '@/modules/upload/storage/minio-storage.adapter'
import { StorageObjectChangedError } from '@/modules/upload/storage/storage.port'

/** 使用虚构配置，拦截 SDK 请求以验证端口协议，不访问真实 MinIO。 */
function fixture() {
  const send = vi.spyOn(S3Client.prototype, 'send')
  const adapter = new MinioStorageAdapter(
    new ConfigService({
      storage: {
        bucket: 'test-bucket',
        endpoint: 'http://storage.example.invalid',
        region: 'test-region',
        accessKeyId: 'test-only-access',
        secretAccessKey: 'test-only-secret',
        forcePathStyle: true,
      },
    }),
  )
  const input = {
    bucket: 'test-bucket',
    objectKey: 'candidate-key',
    ifMatch: '"etag-1"',
    abortSignal: new AbortController().signal,
  }
  return { adapter, send, input }
}

afterEach(() => vi.restoreAllMocks())

describe('MinIO 完整对象条件读取', () => {
  it('固定 If-Match 并传递取消信号，原样返回二进制流', async () => {
    const f = fixture()
    const body = Readable.from([Buffer.from('abc')])
    f.send.mockResolvedValueOnce({
      Body: body,
      ETag: '"etag-1"',
      ContentLength: 3,
      Metadata: { test: 'value' },
    } as never)
    const result = await f.adapter.getObject(f.input)
    const command = f.send.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(GetObjectCommand)
    expect(command?.input).toEqual({
      Bucket: 'test-bucket',
      Key: 'candidate-key',
      IfMatch: '"etag-1"',
    })
    expect(f.send.mock.calls[0]?.[1]).toEqual({ abortSignal: f.input.abortSignal })
    expect(result).toEqual({
      body,
      etag: '"etag-1"',
      contentLength: 3,
      metadata: { test: 'value' },
    })
    body.destroy()
    f.adapter.onModuleDestroy()
  })

  it('条件失败映射为对象变化，其余 SDK 错误保留原因', async () => {
    const f = fixture()
    f.send.mockRejectedValueOnce(
      Object.assign(new Error('changed'), { name: 'PreconditionFailed' }) as never,
    )
    await expect(f.adapter.getObject(f.input)).rejects.toBeInstanceOf(StorageObjectChangedError)
    const cause = new Error('simulated unavailable')
    f.send.mockRejectedValueOnce(cause as never)
    await expect(f.adapter.getObject(f.input)).rejects.toBe(cause)
    f.adapter.onModuleDestroy()
  })

  it('拒绝缺少 Node 二进制读取流的 SDK 响应', async () => {
    const f = fixture()
    f.send.mockResolvedValueOnce({ ETag: '"etag-1"' } as never)
    await expect(f.adapter.getObject(f.input)).rejects.toBeInstanceOf(TypeError)
    f.adapter.onModuleDestroy()
  })
})
