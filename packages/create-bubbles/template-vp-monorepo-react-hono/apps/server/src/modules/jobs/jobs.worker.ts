import { UnrecoverableError, Worker } from 'bullmq'
import { appLogger } from '../../common/logger.js'
import { getEnv } from '../../config/env.js'
import { createQueueConnection } from '../../infrastructure/queue/connection.js'
import {
  markJobRunCompleted,
  markJobRunFailed,
  markJobRunProcessing,
  markJobRunQueuedForRetry,
} from './jobs.repository.js'
import { DEMO_JOB_NAME, type DemoJobData, type DemoJobResult } from './jobs.types.js'

const pendingStatusWrites = new Set<Promise<void>>()

function trackStatusWrite(operation: Promise<unknown>, jobRunId: string): void {
  const tracked = operation
    .then(() => undefined)
    .catch((error: unknown) => {
      appLogger.error('Failed to persist a BullMQ status event', {
        jobRunId,
        error: error instanceof Error ? error.message : String(error),
      })
    })

  pendingStatusWrites.add(tracked)
  void tracked.finally(() => pendingStatusWrites.delete(tracked))
}

export async function waitForJobStatusWrites(): Promise<void> {
  await Promise.allSettled(pendingStatusWrites)
}

export function createJobsWorker(): Worker<DemoJobData, DemoJobResult> {
  const env = getEnv()
  const worker = new Worker<DemoJobData, DemoJobResult>(
    env.JOB_QUEUE_NAME,
    async (job) => {
      const currentAttempt = job.attemptsMade + 1
      const configuredAttempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1

      try {
        await markJobRunProcessing(job.data.jobRunId, currentAttempt)

        if (job.name !== DEMO_JOB_NAME) {
          throw new UnrecoverableError('Unsupported job name: ' + job.name)
        }

        const result: DemoJobResult = {
          processedAt: new Date().toISOString(),
          echo: job.data.payload,
        }

        await markJobRunCompleted(job.data.jobRunId, result)
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const isFinalAttempt =
          error instanceof UnrecoverableError || currentAttempt >= configuredAttempts

        if (isFinalAttempt) {
          await markJobRunFailed(job.data.jobRunId, message)
        } else {
          await markJobRunQueuedForRetry(job.data.jobRunId, currentAttempt, message)
        }

        throw error
      }
    },
    {
      connection: createQueueConnection('worker'),
      prefix: env.JOB_QUEUE_PREFIX,
      concurrency: env.JOB_WORKER_CONCURRENCY,
    },
  )

  worker.on('completed', (job) => {
    appLogger.info('Job completed', { jobId: job.id, jobRunId: job.data.jobRunId })
  })

  worker.on('failed', (job, error) => {
    if (!job) {
      appLogger.error('Job failed before it could be loaded', { error: error.message })
      return
    }

    const configuredAttempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1
    const isFinalAttempt =
      error instanceof UnrecoverableError || job.attemptsMade >= configuredAttempts

    appLogger.warn('Job attempt failed', {
      jobId: job.id,
      jobRunId: job.data.jobRunId,
      attemptsMade: job.attemptsMade,
      configuredAttempts,
      error: error.message,
    })

    if (isFinalAttempt) {
      trackStatusWrite(markJobRunFailed(job.data.jobRunId, error.message), job.data.jobRunId)
    }
  })

  worker.on('error', (error) => {
    appLogger.error('BullMQ worker error', { error: error.message })
  })

  return worker
}
