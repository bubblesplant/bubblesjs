import 'dotenv/config'
import { createApp } from './app.js'
import { appLogger } from './common/logger.js'
import { getEnv } from './config/env.js'
import { closeDatabase } from './infrastructure/database/client.js'
import { closeRedis } from './infrastructure/redis/client.js'
import { closeJobsQueue } from './modules/jobs/jobs.queue.js'
import { closeAll, withShutdownTimeout } from './runtime/shutdown.js'

async function bootstrap(): Promise<void> {
  const env = getEnv()
  const app = createApp()
  const server = Bun.serve({
    hostname: env.HOST,
    port: env.PORT,
    development: env.NODE_ENV !== 'production',
    fetch: (request) => app.fetch(request),
  })
  let shuttingDown = false

  appLogger.info('Bun HTTP server started', {
    address: server.url.toString(),
  })

  const shutdown = async (reason: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    process.exitCode = exitCode
    appLogger.info('Stopping Bun HTTP process', { reason })

    await withShutdownTimeout('http-bun', async () => {
      await closeAll([
        async () => {
          await server.stop(false)
        },
      ])
      await closeAll([closeJobsQueue, closeRedis, closeDatabase])
    })
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('uncaughtException', (error) => {
    appLogger.error('Uncaught Bun exception', { error: error.message, stack: error.stack })
    void shutdown('uncaughtException', 1)
  })
  process.once('unhandledRejection', (reason) => {
    appLogger.error('Unhandled Bun rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    })
    void shutdown('unhandledRejection', 1)
  })
}

void bootstrap().catch((error: unknown) => {
  appLogger.error('Bun HTTP process failed to start', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
