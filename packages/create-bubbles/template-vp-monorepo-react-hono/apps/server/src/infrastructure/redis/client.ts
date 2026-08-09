import { Redis } from 'ioredis'
import { appLogger } from '../../common/logger.js'
import { createRedisOptions } from './options.js'

let redis: Redis | undefined

export function getRedis(): Redis {
  if (redis) return redis

  redis = new Redis(createRedisOptions('cache'))
  redis.on('error', (error: Error) => {
    appLogger.error('Redis connection error', { error: error.message })
  })

  return redis
}

export async function checkRedis(): Promise<void> {
  const client = getRedis()

  if (client.status === 'wait') {
    await client.connect()
  }

  await client.ping()
}

export async function closeRedis(): Promise<void> {
  if (!redis) return

  const client = redis
  redis = undefined

  try {
    await client.quit()
  } catch {
    client.disconnect()
  }
}
