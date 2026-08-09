import { AppError } from '../../common/errors/app-error.js'
import { appLogger } from '../../common/logger.js'
import { getEnv } from '../../config/env.js'
import { enqueueDemoJob } from './jobs.queue.js'
import { createJobRun, findJobRun, markJobRunFailed } from './jobs.repository.js'
import { DEMO_JOB_NAME } from './jobs.types.js'

export async function createDemoJob(payload: Record<string, unknown>) {
  const env = getEnv()
  const jobRun = await createJobRun({
    queueName: env.JOB_QUEUE_NAME,
    jobName: DEMO_JOB_NAME,
    payload,
  })

  try {
    const queueJobId = await enqueueDemoJob({
      jobRunId: jobRun.id,
      payload,
    })

    return {
      ...jobRun,
      queueJobId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown queue error'

    try {
      await markJobRunFailed(jobRun.id, message)
    } catch (updateError) {
      appLogger.error('Failed to update a job run after enqueue failure', {
        jobRunId: jobRun.id,
        error: updateError instanceof Error ? updateError.message : String(updateError),
      })
    }

    throw new AppError({
      status: 503,
      message: '任务队列暂不可用',
      cause: error,
    })
  }
}

export async function getJobRun(id: string) {
  const jobRun = await findJobRun(id)

  if (!jobRun) {
    throw new AppError({
      status: 404,
      message: '任务记录不存在',
    })
  }

  return jobRun
}
