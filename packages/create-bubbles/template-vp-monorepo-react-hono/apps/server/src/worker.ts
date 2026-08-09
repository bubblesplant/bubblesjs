import 'dotenv/config'
import { appLogger } from './common/logger.js'
import { closeDatabase } from './infrastructure/database/client.js'
import { closeRedis } from './infrastructure/redis/client.js'
import { createJobsWorker, waitForJobStatusWrites } from './modules/jobs/jobs.worker.js'
import { closeAll, withShutdownTimeout } from './runtime/shutdown.js'

async function bootstrap(): Promise<void> {
  const worker = createJobsWorker()
  let shuttingDown = false

  worker.on('ready', () => {
    appLogger.info('BullMQ worker started', { name: worker.name })
  })

  const shutdown = async (reason: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    process.exitCode = exitCode
    appLogger.info('Stopping worker process', { reason })

    await withShutdownTimeout('worker', async () => {
      await closeAll([() => worker.close()])
      await closeAll([waitForJobStatusWrites])
      await closeAll([closeRedis, closeDatabase])
    })
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('uncaughtException', (error) => {
    appLogger.error('Uncaught worker exception', { error: error.message, stack: error.stack })
    void shutdown('uncaughtException', 1)
  })
  process.once('unhandledRejection', (reason) => {
    appLogger.error('Unhandled worker rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    })
    void shutdown('unhandledRejection', 1)
  })
}

void bootstrap().catch((error: unknown) => {
  appLogger.error('Worker process failed to start', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
