import { appLogger } from '../../common/logger.js'
import { checkDatabase } from '../../infrastructure/database/client.js'
import { checkRedis } from '../../infrastructure/redis/client.js'

interface DependencyHealth {
  status: 'up' | 'down'
  latencyMs: number
}

async function inspectDependency(
  name: string,
  check: () => Promise<void>,
): Promise<DependencyHealth> {
  const startedAt = performance.now()

  try {
    await check()
    return {
      status: 'up',
      latencyMs: Math.round(performance.now() - startedAt),
    }
  } catch (error) {
    appLogger.warn('Health dependency check failed', {
      dependency: name,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - startedAt),
    }
  }
}

export function getLiveness() {
  return {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  }
}

export async function getReadiness() {
  const [database, redis] = await Promise.all([
    inspectDependency('postgres', checkDatabase),
    inspectDependency('redis', checkRedis),
  ])
  const isReady = database.status === 'up' && redis.status === 'up'

  return {
    status: isReady ? ('ok' as const) : ('error' as const),
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    dependencies: {
      database,
      redis,
    },
  }
}
