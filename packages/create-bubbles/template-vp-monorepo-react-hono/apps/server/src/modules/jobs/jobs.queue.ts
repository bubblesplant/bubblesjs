import { Queue } from 'bullmq'
import { getEnv } from '../../config/env.js'
import { createQueueConnection } from '../../infrastructure/queue/connection.js'
import { DEMO_JOB_NAME, type DemoJobData, type DemoJobResult } from './jobs.types.js'

let jobsQueue: Queue<DemoJobData, DemoJobResult> | undefined

export function getJobsQueue(): Queue<DemoJobData, DemoJobResult> {
  if (jobsQueue) return jobsQueue

  const env = getEnv()
  jobsQueue = new Queue<DemoJobData, DemoJobResult>(env.JOB_QUEUE_NAME, {
    connection: createQueueConnection('queue'),
    prefix: env.JOB_QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 86_400,
        count: 5000,
      },
    },
  })

  return jobsQueue
}

export async function enqueueDemoJob(data: DemoJobData): Promise<string | undefined> {
  const job = await getJobsQueue().add(DEMO_JOB_NAME, data, { jobId: data.jobRunId })
  return job.id
}

export async function closeJobsQueue(): Promise<void> {
  if (!jobsQueue) return

  const queue = jobsQueue
  jobsQueue = undefined
  await queue.close()
}
