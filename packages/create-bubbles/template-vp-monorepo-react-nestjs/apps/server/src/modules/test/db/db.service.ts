import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import { Inject, Injectable } from '@nestjs/common'
import { users } from '@/database/schema'

@Injectable()
export class DbService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async ping() {
    const res = await this.db.execute('SELECT now() AS now')
    return res.rows[0]
  }

  async findAll() {
    return this.db.query.users.findMany()
  }

  async create(data: Omit<typeof users.$inferInsert, 'id' | 'createdAt'>) {
    const [row] = await this.db.insert(users).values(data).returning()
    return row
  }
}
