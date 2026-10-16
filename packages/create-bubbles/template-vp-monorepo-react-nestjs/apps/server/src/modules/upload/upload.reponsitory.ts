import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import { uploadSessions } from '@/database/schema'
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'

export type UploadSession = typeof uploadSessions.$inferSelect
export type CreateUploadSession = typeof uploadSessions.$inferInsert

@Injectable()
export class UploadRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * 插入上传会话，用户与客户端上传标识冲突时返回 null，供上层处理并发初始化。
   */
  async create(input: CreateUploadSession): Promise<UploadSession | null> {
    const [session] = await this.db
      .insert(uploadSessions)
      .values(input)
      .onConflictDoNothing({
        target: [uploadSessions.ownerId, uploadSessions.clientUploadId],
      })
      .returning()

    return session ?? null
  }

  /**
   * 按会话 ID 和所属用户查询上传记录，不存在或不属于当前用户时返回 null。
   */
  async findById(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .select()
      .from(uploadSessions)
      .where(and(eq(uploadSessions.id, uploadSessionId), eq(uploadSessions.ownerId, ownerId)))
      .limit(1)
    return session ?? null
  }

  /**
   * 查找用户已创建的客户端上传标识，支持重复初始化和断点续传。
   */
  async findByClientUploadId(
    ownerId: string,
    clientUploadId: string,
  ): Promise<UploadSession | null> {
    const [session] = await this.db
      .select()
      .from(uploadSessions)
      .where(
        and(eq(uploadSessions.ownerId, ownerId), eq(uploadSessions.clientUploadId, clientUploadId)),
      )
      .limit(1)

    return session ?? null
  }

  /**
   * 仅将 uploading 会话原子更新为 completing，返回成功抢占的记录；状态不符时返回 null。
   */
  async claimCompleting(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'completing',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'uploading'),
        ),
      )
      .returning()

    return session ?? null
  }

  /**
   * 仅将 completing 会话标记为 completed，原子保存可信完整摘要、ETag 和完成时间。
   */
  async markCompleted(input: {
    ownerId: string
    uploadSessionId: string
    objectEtag: string
    objectSha256: string
  }): Promise<UploadSession | null> {
    const now = new Date()
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'completed',
        objectEtag: input.objectEtag,
        objectSha256: input.objectSha256,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(uploadSessions.id, input.uploadSessionId),
          eq(uploadSessions.ownerId, input.ownerId),
          eq(uploadSessions.status, 'completing'),
        ),
      )
      .returning()

    return session ?? null
  }

  /**
   * 将上传中、取消中或过期会话设为 aborting，允许重试取消但不会抢占完成流程。
   */
  async claimAborting(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'aborting',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          inArray(uploadSessions.status, ['uploading', 'aborting', 'expired']),
        ),
      )
      .returning()

    return session ?? null
  }

  /**
   * 仅将 aborting 会话更新为 aborted，状态已变化时返回 null。
   */
  async markAborted(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'aborted',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'aborting'),
        ),
      )
      .returning()

    return session ?? null
  }

  /**
   * 仅将仍在 uploading 的会话标记为 expired，返回需要清理存储分片的记录。
   */
  async markExpired(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'expired',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'uploading'),
        ),
      )
      .returning()

    return session ?? null
  }

  /**
   * 在尚未发送存储合并请求时，将 completing 会话恢复为 uploading 以允许修正分片后重试。
   */
  async resetCompleting(ownerId: string, uploadSessionId: string): Promise<void> {
    await this.db
      .update(uploadSessions)
      .set({
        status: 'uploading',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'completing'),
        ),
      )
  }
}
