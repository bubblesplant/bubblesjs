import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import { users } from '@/database/schema'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'

type CreateUserInput = Pick<typeof users.$inferInsert, 'name' | 'account' | 'passwordHash'>

@Injectable()
export class AuthRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findByAccount(account: string) {
    const [user] = await this.db.select().from(users).where(eq(users.account, account)).limit(1)
    return user ?? null
  }

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

  async createUser(input: CreateUserInput) {
    const [user] = await this.db
      .insert(users)
      .values(input)
      // 处理账号重复情况 ，不插入重复账号
      .onConflictDoNothing({ target: users.account })
      .returning()
    return user ?? null
  }
}
