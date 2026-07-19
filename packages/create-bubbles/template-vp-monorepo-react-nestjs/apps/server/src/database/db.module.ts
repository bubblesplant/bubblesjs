import { Global, Module } from '@nestjs/common'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/database/schema'
import { ConfigService } from '@nestjs/config'
import { Pool } from 'pg'

export const DRIZZLE = Symbol('DRIZZLE_DB')

export type DrizzleDB = NodePgDatabase<typeof schema>

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const pool = new Pool({
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          database: config.get<string>('database.database'),
          user: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
        })

        return drizzle(pool, { schema })
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
