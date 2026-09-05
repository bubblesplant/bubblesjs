import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { type Job, UnrecoverableError } from 'bullmq'
import { TASK_JOB_NAMES, TASK_QUEUE_CONCURRENCY, TASK_QUEUE_NAME } from './task-queue.constants'
import { QueueSmokePayloadSchema } from './task-queue.contracts'

@Processor(TASK_QUEUE_NAME, { concurrency: TASK_QUEUE_CONCURRENCY })
export class TaskQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskQueueProcessor.name)

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case TASK_JOB_NAMES.QUEUE_SMOKE: {
        const parsed = QueueSmokePayloadSchema.safeParse(job.data)

        if (!parsed.success) {
          throw new UnrecoverableError('Invalid payload for ' + job.name)
        }

        return {
          marker: parsed.data.marker,
          processedAt: new Date().toISOString(),
        }
      }

      default:
        throw new UnrecoverableError('Unsupported task name: ' + job.name)
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log({
      event: 'queue_job_completed',
      queueName: TASK_QUEUE_NAME,
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
    })
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error({
      event: 'queue_job_failed',
      queueName: TASK_QUEUE_NAME,
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      errorName: error.name,
    })
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error) {
    this.logger.error({
      event: 'queue_worker_error',
      queueName: TASK_QUEUE_NAME,
      errorName: error.name,
    })
  }
}
