import 'dotenv/config'
import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { createApp } from './app.js'
import { appLogger } from './common/logger.js'
import { getEnv } from './config/env.js'
import { closeDatabase } from './infrastructure/database/client.js'
import { closeRedis } from './infrastructure/redis/client.js'
import { closeJobsQueue } from './modules/jobs/jobs.queue.js'
import { closeAll, withShutdownTimeout } from './runtime/shutdown.js'

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

async function bootstrap(): Promise<void> {
  const env = getEnv()
  const app = createApp()
  const server = serve(
    {
      fetch: app.fetch,
      hostname: env.HOST,
      port: env.PORT,
    },
    (info) => {
      appLogger.info('HTTP server started', {
        address: 'http://' + info.address + ':' + info.port,
      })
    },
  )
  let shuttingDown = false

  const shutdown = async (reason: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    process.exitCode = exitCode
    appLogger.info('Stopping HTTP process', { reason })

    await withShutdownTimeout('http', async () => {
      await closeAll([() => closeServer(server)])
      await closeAll([closeJobsQueue, closeRedis, closeDatabase])
    })
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('uncaughtException', (error) => {
    appLogger.error('Uncaught exception', { error: error.message, stack: error.stack })
    void shutdown('uncaughtException', 1)
  })
  process.once('unhandledRejection', (reason) => {
    appLogger.error('Unhandled rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    })
    void shutdown('unhandledRejection', 1)
  })
}

void bootstrap().catch((error: unknown) => {
  appLogger.error('HTTP process failed to start', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
