import { AppException } from '@/common/exceptions/app.exception'
import { users } from '@/database/schema'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import { AccessService, type AccessActor } from '@/modules/access/access.service'
import { PasswordService } from '@/modules/auth/password.service'
import { AUTH_ERRORS } from '@/modules/auth/auth.errors'
import { SessionStoreService } from '@/modules/auth/session/session-store.service'
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { ResetAccountPasswordRequest, ResetAccountPasswordResult } from 'shared/types'

interface ResetPasswordInput {
  actor: AccessActor
  userId: string
  body: ResetAccountPasswordRequest
  onTargetResolved?: (targetUserId: string) => void
}

@Injectable()
export class AccountPasswordResetService {
  constructor(
    private readonly access: AccessService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionStoreService,
  ) {}

  /**
   * 在平台写事务中复核内置管理员、排除本人，更新目标摘要并撤销目标全部会话。
   * 撤销失败时密码与成功审计均回滚，目标状态和成员关系保持原样。
   */
  async resetPassword(input: ResetPasswordInput): Promise<ResetAccountPasswordResult> {
    try {
      return await this.access.write(
        {
          actor: input.actor,
          scope: { type: 'platform' },
          permission: 'platform.accounts.reset-password',
          adminOnly: true,
        },
        async (tx, access) => {
          if (access.administrator !== 'platform' || input.userId === input.actor.userId) {
            throw new AppException(ACCESS_ERRORS.FORBIDDEN)
          }

          const [user] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, input.userId))
            .for('update')
          if (!user) throw new AppException(ACCESS_ERRORS.NOT_FOUND)
          input.onTargetResolved?.(user.id)

          let passwordHash: string
          try {
            passwordHash = await this.passwords.hash(input.body.newPassword)
          } catch {
            throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE)
          }
          await tx
            .update(users)
            .set({ passwordHash, updatedAt: new Date() })
            .where(eq(users.id, input.userId))
          await this.access.audit(tx, {
            actor: input.actor,
            access,
            action: 'account.password.reset',
            objectType: 'account',
            objectId: input.userId,
            summary: { result: 'success' },
          })
          await this.sessions.revokeAllForUser(input.userId)
          return { passwordReset: true }
        },
      )
    } catch (cause: unknown) {
      if (cause instanceof AppException) throw cause
      // 事务开启、SQL 写入、审计写入或提交失败均属于本操作必需的认证存储故障。
      throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE)
    }
  }
}
