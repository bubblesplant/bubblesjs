import 'reflect-metadata'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { PassThrough, Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vite-plus/test'
import { ContentHashService } from '@/modules/upload/hash/content-hash.service'
import {
  STORAGE_PORT,
  StorageObjectChangedError,
  StorageMultipartNotFoundError,
  type StoragePort,
} from '@/modules/upload/storage/storage.port'
import { UploadRepository, type UploadSession } from '@/modules/upload/upload.reponsitory'
import { UploadService } from '@/modules/upload/upload.service'

const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

/** 模拟持久化与存储状态，保留真实上传服务、流读取和 crypto Worker。 */
function fixture(status: UploadSession['status'] = 'uploading') {
  let current: UploadSession = {
    id: 'session-a',
    ownerId: 'owner-a',
    clientUploadId: 'client-a',
    bucket: 'test-bucket',
    objectKey: 'test-key',
    storageUploadId: 'multipart-a',
    originalName: 'sample.bin',
    contentType: 'application/octet-stream',
    fileSize: 3,
    partSize: 10 * 1024 * 1024,
    totalParts: 1,
    status,
    expiresAt: new Date(Date.now() + 3600_000),
    objectEtag: null,
    objectSha256: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  }
  let exists = status !== 'uploading'
  const object = {
    etag: '"object-etag-1"',
    contentLength: 3,
    metadata: { 'upload-session-id': current.id, 'owner-id': current.ownerId },
  }
  const repository = {
    findById: vi.fn(async (ownerId: string, id: string) =>
      ownerId === current.ownerId && id === current.id ? current : null,
    ),
    claimCompleting: vi.fn(async () => {
      if (current.status !== 'uploading') return null
      current = { ...current, status: 'completing' }
      return current
    }),
    markCompleted: vi.fn(async (input: { objectSha256: string; objectEtag: string }) => {
      if (current.status !== 'completing') return null
      current = { ...current, ...input, status: 'completed', completedAt: new Date() }
      return current
    }),
    resetCompleting: vi.fn(async () => {
      current = { ...current, status: 'uploading' }
    }),
  }
  const storage = {
    headObject: vi.fn(async () => (exists ? { ...object } : null)),
    getObject: vi.fn(async () => ({ ...object, body: Readable.from([Buffer.from('abc')]) })),
    listParts: vi.fn(async () => [{ partNumber: 1, size: 3, etag: 'part-etag' }]),
    completeMultipartUpload: vi.fn(async () => {
      exists = true
      return { etag: object.etag }
    }),
    abortMultipartUpload: vi.fn(),
  }
  const service = new UploadService(
    repository as unknown as UploadRepository,
    storage as unknown as StoragePort,
    new ConfigService({ storage: { bucket: 'test-bucket', sessionTtlMs: 3600_000 } }),
  )
  Object.assign(service, { contentHash: new ContentHashService() })
  return { service, repository, storage, object, session: () => current }
}

describe('分片合并后的可信摘要与恢复', () => {
  it('Nest 能注入摘要服务并在关闭模块时释放计算资源', async () => {
    const f = fixture()
    const module = await Test.createTestingModule({
      providers: [
        UploadService,
        ContentHashService,
        { provide: UploadRepository, useValue: f.repository },
        { provide: STORAGE_PORT, useValue: f.storage },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            storage: { bucket: 'test-bucket', sessionTtlMs: 3600_000 },
          }),
        },
      ],
    }).compile()
    try {
      expect(await module.get(UploadService).complete('owner-a', 'session-a')).toMatchObject({
        status: 'completed',
      })
      expect(f.session().objectSha256).toBe(SHA256_ABC)
    } finally {
      await module.close()
    }
  })

  it('合并、条件读取后才保存摘要，完成重试复用结果并保持公开字段', async () => {
    const f = fixture()
    const result = await f.service.complete('owner-a', 'session-a')
    expect(f.repository.markCompleted).toHaveBeenCalledWith({
      ownerId: 'owner-a',
      uploadSessionId: 'session-a',
      objectEtag: '"object-etag-1"',
      objectSha256: SHA256_ABC,
    })
    expect(f.storage.getObject).toHaveBeenCalledWith(
      expect.objectContaining({ ifMatch: '"object-etag-1"' }),
    )
    expect(result).toEqual({
      uploadSessionId: 'session-a',
      status: 'completed',
      objectKey: 'test-key',
      etag: '"object-etag-1"',
    })
    expect(await f.service.complete('owner-a', 'session-a')).toEqual(result)
    expect(f.storage.getObject).toHaveBeenCalledOnce()
    expect(f.storage.completeMultipartUpload).toHaveBeenCalledOnce()
  })

  it('仅探测到对象不能提前标记完成，必须等待完整流', async () => {
    const f = fixture('completing')
    const body = new PassThrough()
    f.storage.getObject.mockResolvedValueOnce({ ...f.object, body })
    const pending = f.service.complete('owner-a', 'session-a')
    await vi.waitFor(() => expect(f.storage.getObject).toHaveBeenCalledOnce())
    body.write('a')
    expect(f.repository.markCompleted).not.toHaveBeenCalled()
    body.end('bc')
    await pending
    expect(f.session().objectSha256).toBe(SHA256_ABC)
    expect(f.storage.completeMultipartUpload).not.toHaveBeenCalled()
  })

  it('合并响应丢失时，仍须读取完整对象后恢复', async () => {
    const f = fixture()
    f.storage.completeMultipartUpload.mockImplementationOnce(async () => {
      f.storage.headObject.mockResolvedValue(f.object)
      throw new Error('response lost')
    })
    await f.service.complete('owner-a', 'session-a')
    expect(f.storage.getObject).toHaveBeenCalledOnce()
    expect(f.session().objectSha256).toBe(SHA256_ABC)
  })

  it('写库失败保留 completing，下一次完成重新验证，成功后不再重算', async () => {
    const f = fixture()
    f.repository.markCompleted.mockRejectedValueOnce(new Error('simulated database failure'))
    await expect(f.service.complete('owner-a', 'session-a')).rejects.toThrow(
      'simulated database failure',
    )
    expect(f.session().status).toBe('completing')
    expect(f.storage.getObject).toHaveBeenCalledOnce()
    await f.service.complete('owner-a', 'session-a')
    await f.service.complete('owner-a', 'session-a')
    expect(f.storage.getObject).toHaveBeenCalledTimes(2)
    expect(f.storage.completeMultipartUpload).toHaveBeenCalledOnce()
    expect(f.storage.abortMultipartUpload).not.toHaveBeenCalled()
  })

  it('multipart 已消失时继续可信恢复，校验失败不会误报为上传丢失', async () => {
    const f = fixture()
    f.storage.listParts.mockRejectedValueOnce(
      new StorageMultipartNotFoundError(new Error('already merged')),
    )
    f.storage.headObject.mockResolvedValue(f.object)
    f.storage.getObject.mockResolvedValueOnce({
      ...f.object,
      body: Readable.from([Buffer.from('ab')]),
    })
    await expect(f.service.complete('owner-a', 'session-a')).rejects.toMatchObject({
      definition: { code: 'UPLOAD.OBJECT_VERIFICATION_FAILED' },
    })
    expect(f.session().status).toBe('completing')
    expect(f.repository.resetCompleting).not.toHaveBeenCalled()
    expect(f.repository.markCompleted).not.toHaveBeenCalled()
    await f.service.complete('owner-a', 'session-a')
    expect(f.session().objectSha256).toBe(SHA256_ABC)
  })

  it('合并响应未知后的摘要程序错误不包装为存储不可用', async () => {
    const f = fixture()
    f.storage.completeMultipartUpload.mockImplementationOnce(async () => {
      f.storage.headObject.mockResolvedValue(f.object)
      throw new Error('response unknown')
    })
    Object.assign(f.service, {
      contentHash: {
        calculate: async () => {
          throw new Error('simulated hashing bug')
        },
      },
    })
    await expect(f.service.complete('owner-a', 'session-a')).rejects.toThrow(
      'simulated hashing bug',
    )
    expect(f.session().status).toBe('completing')
    expect(f.repository.markCompleted).not.toHaveBeenCalled()
  })

  it('读取失败不保存部分结果，不在同一请求重算，之后可恢复', async () => {
    const f = fixture()
    f.storage.getObject.mockResolvedValueOnce({
      ...f.object,
      body: new Readable({
        read() {
          this.destroy(new Error('storage stream interrupted'))
        },
      }),
    })
    await expect(f.service.complete('owner-a', 'session-a')).rejects.toMatchObject({
      definition: { code: 'UPLOAD.STORAGE_UNAVAILABLE' },
    })
    expect(f.repository.markCompleted).not.toHaveBeenCalled()
    expect(f.storage.getObject).toHaveBeenCalledOnce()
    expect(f.session().status).toBe('completing')
    await f.service.complete('owner-a', 'session-a')
    expect(f.session().objectSha256).toBe(SHA256_ABC)
  })

  it.each([
    { contentLength: 4 },
    { etag: null },
    { metadata: { 'upload-session-id': 'other-session', 'owner-id': 'owner-a' } },
    { metadata: { 'upload-session-id': 'session-a', 'owner-id': 'other-owner' } },
  ])('探测身份或长度不符不能恢复：%j', async (patch) => {
    const f = fixture('completing')
    f.storage.headObject.mockResolvedValueOnce({ ...f.object, ...patch } as typeof f.object)
    await expect(f.service.complete('owner-a', 'session-a')).rejects.toMatchObject({
      definition: { code: 'UPLOAD.OBJECT_VERIFICATION_FAILED' },
    })
    expect(f.storage.getObject).not.toHaveBeenCalled()
    expect(f.repository.markCompleted).not.toHaveBeenCalled()
  })

  it('条件读取失败或读取响应身份变化，均不能标记完成', async () => {
    const f = fixture('completing')
    f.storage.getObject.mockRejectedValueOnce(
      new StorageObjectChangedError(new Error('precondition failed')),
    )
    await expect(f.service.complete('owner-a', 'session-a')).rejects.toMatchObject({
      definition: { code: 'UPLOAD.OBJECT_VERIFICATION_FAILED' },
    })
    const body = Readable.from([Buffer.from('abc')])
    f.storage.getObject.mockResolvedValueOnce({ ...f.object, etag: 'changed', body })
    await expect(f.service.complete('owner-a', 'session-a')).rejects.toMatchObject({
      definition: { code: 'UPLOAD.OBJECT_VERIFICATION_FAILED' },
    })
    expect(body.destroyed).toBe(true)
    expect(f.repository.markCompleted).not.toHaveBeenCalled()
  })

  it.each(['ab', 'abcd'])('实际流长度不符拒绝保存：%s', async (bytes) => {
    const f = fixture()
    f.storage.getObject.mockResolvedValueOnce({
      ...f.object,
      body: Readable.from([Buffer.from(bytes)]),
    })
    await expect(f.service.complete('owner-a', 'session-a')).rejects.toMatchObject({
      definition: { code: 'UPLOAD.OBJECT_VERIFICATION_FAILED' },
    })
    expect(f.repository.markCompleted).not.toHaveBeenCalled()
    expect(f.session().status).toBe('completing')
  })

  it('并发完成和状态恢复共用一次完整校验', async () => {
    const f = fixture('completing')
    const [first, second, status] = await Promise.all([
      f.service.complete('owner-a', 'session-a'),
      f.service.complete('owner-a', 'session-a'),
      f.service.getStatus('owner-a', 'session-a'),
    ])
    expect(first).toEqual(second)
    expect(status.status).toBe('completed')
    expect(f.storage.getObject).toHaveBeenCalledOnce()
    expect(f.repository.markCompleted).toHaveBeenCalledOnce()
    expect(f.storage.listParts).not.toHaveBeenCalled()
  })

  it('completing 对象尚不可见时返回状态，不查询已失效的 multipart', async () => {
    const f = fixture('completing')
    f.storage.headObject.mockResolvedValueOnce(null)
    expect(await f.service.getStatus('owner-a', 'session-a')).toMatchObject({
      status: 'completing',
      uploadedParts: [],
    })
    expect(f.storage.listParts).not.toHaveBeenCalled()
  })

  it('合并前分片不完整时回退 uploading', async () => {
    const f = fixture()
    f.storage.listParts.mockResolvedValueOnce([])
    await expect(f.service.complete('owner-a', 'session-a')).rejects.toMatchObject({
      definition: { code: 'UPLOAD.PARTS_INCOMPLETE' },
    })
    expect(f.session().status).toBe('uploading')
    expect(f.storage.completeMultipartUpload).not.toHaveBeenCalled()
  })

  it('历史已完成记录保持 null 摘要，跨用户请求不能读取对象', async () => {
    const f = fixture('completed')
    await f.service.complete('owner-a', 'session-a')
    await expect(f.service.complete('another-owner', 'session-a')).rejects.toMatchObject({
      definition: { code: 'UPLOAD.SESSION_NOT_FOUND' },
    })
    expect(f.session().objectSha256).toBeNull()
    expect(f.storage.headObject).not.toHaveBeenCalled()
    expect(f.storage.getObject).not.toHaveBeenCalled()
  })
})
