import { eq } from 'drizzle-orm'
import { AppError } from '../../common/errors/app-error.js'
import { getDatabase } from '../../infrastructure/database/client.js'
import { jobRuns, type JobRun } from '../../infrastructure/database/schema/index.js'

interface CreateJobRunInput {
  queueName: string
  jobName: string
  payload: Record<string, unknown>
}

function requireJobRun(jobRun: JobRun | undefined, id?: string): JobRun {
  if (jobRun) return jobRun

  throw new AppError({
    status: 404,
    message: id ? '任务记录不存在: ' + id : '任务记录创建失败',
  })
}

export async function createJobRun(input: CreateJobRunInput): Promise<JobRun> {
  const [jobRun] = await getDatabase().insert(jobRuns).values(input).returning()
  return requireJobRun(jobRun)
}

export async function findJobRun(id: string): Promise<JobRun | undefined> {
  const [jobRun] = await getDatabase().select().from(jobRuns).where(eq(jobRuns.id, id)).limit(1)
  return jobRun
}

export async function markJobRunProcessing(id: string, attempts: number): Promise<JobRun> {
  const [jobRun] = await getDatabase()
    .update(jobRuns)
    .set({
      status: 'processing',
      attempts,
      error: null,
      startedAt: new Date(),
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(jobRuns.id, id))
    .returning()

  return requireJobRun(jobRun, id)
}

export async function markJobRunQueuedForRetry(
  id: string,
  attempts: number,
  error: string,
): Promise<JobRun> {
  const [jobRun] = await getDatabase()
    .update(jobRuns)
    .set({
      status: 'queued',
      attempts,
      error: error.slice(0, 10_000),
      startedAt: null,
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(jobRuns.id, id))
    .returning()

  return requireJobRun(jobRun, id)
}

export async function markJobRunCompleted(
  id: string,
  result: Record<string, unknown>,
): Promise<JobRun> {
  const [jobRun] = await getDatabase()
    .update(jobRuns)
    .set({
      status: 'completed',
      result,
      error: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jobRuns.id, id))
    .returning()

  return requireJobRun(jobRun, id)
}

export async function markJobRunFailed(id: string, error: string): Promise<JobRun> {
  const [jobRun] = await getDatabase()
    .update(jobRuns)
    .set({
      status: 'failed',
      error: error.slice(0, 10_000),
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jobRuns.id, id))
    .returning()

  return requireJobRun(jobRun, id)
}
