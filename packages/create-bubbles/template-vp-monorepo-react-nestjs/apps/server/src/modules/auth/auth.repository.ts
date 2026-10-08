import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import { users } from '@/database/schema'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'

type CreateUserInput = Pick<typeof users.$inferInsert, 'name' | 'account' | 'passwordHash'>

interface PasswordWriteContext {
  passwordHash: string
  /** 在当前用户行锁和事务中写入新摘要。 */
  setPasswordHash: (passwordHash: string) => Promise<void>
}

@Injectable()
export class AuthRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * 按标准化账号查找完整用户记录，供密码校验使用；不存在时返回 null。
   */
  async findByAccount(account: string) {
    const [user] = await this.db.select().from(users).where(eq(users.account, account)).limit(1)
    return user ?? null
  }

  /**
   * 按用户 ID 读取身份与状态字段，避免查询结果携带密码摘要。
   */
  async findPublicById(userId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        account: users.account,
        name: users.name,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return user ?? null
  }

  /**
   * 插入用户并返回记录；账号唯一键冲突时不写入并返回 null。
   */
  async createUser(input: CreateUserInput) {
    const [user] = await this.db
      .insert(users)
      .values(input)
      // 处理账号重复情况 ，不插入重复账号
      .onConflictDoNothing({ target: users.account })
      .returning()
    return user ?? null
  }

  /**
   * 在事务中对启用用户持有共享行锁，并把锁内的最新密码摘要交给回调。
   * 登录须复核该摘要，避免在并发改密撤销后凭旧密码建立新会话。
   * @returns 操作结果；用户不存在或已停用时返回 null。
   */
  withActiveUserLock<T>(userId: string, operation: (passwordHash: string) => Promise<T>) {
    /** 在事务结束前保留共享行锁，保证回调执行期间账号状态及摘要不再变化。 */
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ status: users.status, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .for('share')
      if (!user || user.status !== 'active') return null
      return operation(user.passwordHash)
    })
  }

  /**
   * 以排他行锁读取本人账号的最新摘要，并在同一事务中执行密码更新及会话撤销。
   * 回调抛错时数据库更新回滚；已成功的 Redis 撤销不会恢复。
   */
  withPasswordWriteLock<T>(
    userId: string,
    operation: (context: PasswordWriteContext) => Promise<T>,
  ) {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ status: users.status, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .for('update')
      if (!user || user.status !== 'active') return null
      return operation({
        passwordHash: user.passwordHash,
        setPasswordHash: async (passwordHash) => {
          await tx
            .update(users)
            .set({ passwordHash, updatedAt: new Date() })
            .where(eq(users.id, userId))
        },
      })
    })
  }
}
