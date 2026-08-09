import type { RedisOptions } from 'ioredis'
import { getEnv } from '../../config/env.js'

export type RedisRole = 'cache' | 'queue' | 'worker'

export function createRedisOptions(role: RedisRole): RedisOptions {
  const env = getEnv()
  const redisUrl = new URL(env.REDIS_URL)
  const databasePath = redisUrl.pathname.slice(1)
  const database = databasePath ? Number.parseInt(databasePath, 10) : 0

  if (Number.isNaN(database)) {
    throw new Error('REDIS_URL contains an invalid database number')
  }

  return {
    host: redisUrl.hostname,
    port: Number.parseInt(redisUrl.port || '6379', 10),
    username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
    password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    db: database,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
    connectionName: env.APP_NAME + ':' + role,
    lazyConnect: role === 'cache',
    maxRetriesPerRequest: role === 'worker' ? null : 1,
  }
}
