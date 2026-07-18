import { DRIZZLE, type DrizzleDB } from '@/db/db.module'
import { Inject, Injectable } from '@nestjs/common'
import { users } from '@/db/schema'

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

  async create(name: string, email: string) {
    const [row] = await this.db.insert(users).values({ name, email }).returning()
    return row
  }
}
