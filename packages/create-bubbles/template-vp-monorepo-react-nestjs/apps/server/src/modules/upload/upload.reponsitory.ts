import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import { uploadSessions } from '@/database/schema'
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'

export type UploadSession = typeof uploadSessions.$inferSelect
export type CreateUploadSession = typeof uploadSessions.$inferInsert

@Injectable()
export class UploadRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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

  async findById(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .select()
      .from(uploadSessions)
      .where(and(eq(uploadSessions.id, uploadSessionId), eq(uploadSessions.ownerId, ownerId)))
      .limit(1)
    return session ?? null
  }

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

  async markCompleted(
    ownerId: string,
    uploadSessionId: string,
    objectEtag: string | null,
  ): Promise<UploadSession | null> {
    const now = new Date()
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'completed',
        objectEtag,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'completing'),
        ),
      )
      .returning()

    return session ?? null
  }

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
}
