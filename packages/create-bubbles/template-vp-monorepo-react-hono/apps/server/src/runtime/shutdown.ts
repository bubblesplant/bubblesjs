import { appLogger } from '../common/logger.js'
import { getEnv } from '../config/env.js'

export async function withShutdownTimeout(
  processName: string,
  close: () => Promise<void>,
): Promise<void> {
  const timeout = setTimeout(() => {
    appLogger.error('Graceful shutdown timed out', { process: processName })
    process.exit(1)
  }, getEnv().SHUTDOWN_TIMEOUT_MS)
  timeout.unref()

  try {
    await close()
  } catch (error) {
    process.exitCode = 1
    appLogger.error('Graceful shutdown failed', {
      process: processName,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function closeAll(resources: Array<() => Promise<void>>): Promise<void> {
  const results = await Promise.allSettled(resources.map((close) => close()))

  for (const result of results) {
    if (result.status === 'rejected') {
      process.exitCode = 1
      appLogger.error('A resource failed to close', {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  }
}
