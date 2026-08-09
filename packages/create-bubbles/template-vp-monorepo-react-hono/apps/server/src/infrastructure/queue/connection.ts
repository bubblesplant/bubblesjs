import type { ConnectionOptions } from 'bullmq'
import { createRedisOptions } from '../redis/options.js'

export function createQueueConnection(role: 'queue' | 'worker'): ConnectionOptions {
  return createRedisOptions(role)
}
