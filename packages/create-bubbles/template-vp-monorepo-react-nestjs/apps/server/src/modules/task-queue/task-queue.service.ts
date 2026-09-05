import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { JobsOptions, Queue } from 'bullmq'
import { TASK_QUEUE_NAME } from './task-queue.constants'
import {
  type EnqueuedTask,
  type EnqueueTaskOptions,
  parseTaskPayload,
  type TaskName,
  type TaskPayloadMap,
} from './task-queue.contracts'

@Injectable()
export class TaskQueueService {
  constructor(
    @InjectQueue(TASK_QUEUE_NAME)
    private readonly queue: Queue,
  ) {}

  async enqueue<Name extends TaskName>(
    name: Name,
    payload: TaskPayloadMap[Name],
    options: EnqueueTaskOptions = {},
  ): Promise<EnqueuedTask<Name>> {
    this.validateOptions(options)

    const data = parseTaskPayload(name, payload)
    const jobOptions: JobsOptions = {
      ...(options.jobId === undefined ? {} : { jobId: options.jobId }),
      ...(options.delayMs === undefined ? {} : { delay: options.delayMs }),
    }

    const job = await this.queue.add(name, data, jobOptions)

    if (job.id === undefined) {
      throw new Error('BullMQ returned a Job without an id')
    }

    return {
      queueName: TASK_QUEUE_NAME,
      jobId: job.id,
      name,
    }
  }

  private validateOptions(options: EnqueueTaskOptions) {
    if (options.jobId?.includes(':')) {
      throw new Error('BullMQ jobId must not contain a colon')
    }

    if (
      options.delayMs !== undefined &&
      (!Number.isSafeInteger(options.delayMs) || options.delayMs < 0)
    ) {
      throw new Error('delayMs must be a non-negative safe integer')
    }
  }
}
