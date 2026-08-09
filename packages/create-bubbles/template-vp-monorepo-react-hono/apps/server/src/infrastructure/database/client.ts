import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { getEnv } from '../../config/env.js'
import { appLogger } from '../../common/logger.js'
import * as schema from './schema/index.js'

export type Database = NodePgDatabase<typeof schema>

let pool: Pool | undefined
let database: Database | undefined

function getPool(): Pool {
  if (pool) return pool

  const env = getEnv()
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
  })
  pool.on('error', (error) => {
    appLogger.error('Unexpected PostgreSQL pool error', { error: error.message })
  })

  return pool
}

export function getDatabase(): Database {
  if (!database) {
    database = drizzle(getPool(), { schema })
  }

  return database
}

export async function checkDatabase(): Promise<void> {
  await getPool().query('select 1')
}

export async function closeDatabase(): Promise<void> {
  if (!pool) return

  const currentPool = pool
  pool = undefined
  database = undefined
  await currentPool.end()
}
