import { randomUUID } from 'node:crypto'
import { getQueueToken } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'
import { Test, type TestingModule } from '@nestjs/testing'
import { type Queue, QueueEvents } from 'bullmq'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import queueConfig from '@/config/queue.config'
import { TaskQueueModule } from '@/modules/task-queue/task-queue.module'
import { TaskQueueService } from '@/modules/task-queue/task-queue.service'
import { TASK_JOB_NAMES, TASK_QUEUE_NAME } from '@/modules/task-queue/task-queue.constants'
import { ENV_ARR } from '@/utils/env-arr'

const describeQueueIntegration =
  process.env.RUN_QUEUE_INTEGRATION === 'true' ? describe : describe.skip

describeQueueIntegration('TaskQueue Redis integration', () => {
  let testingModule: TestingModule | undefined
  let queue: Queue | undefined
  let queueEvents: QueueEvents | undefined
  let taskQueueService: TaskQueueService | undefined

  const previousPrefix = process.env.QUEUE_PREFIX
  const previousWorkerEnabled = process.env.QUEUE_WORKER_ENABLED
  const uniquePrefix = 'bubbles:test:' + randomUUID() + ':queue'

  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Queue integration test must not run in production')
    }

    process.env.QUEUE_PREFIX = uniquePrefix
    process.env.QUEUE_WORKER_ENABLED = 'true'

    testingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ENV_ARR,
          load: [queueConfig],
        }),
        TaskQueueModule,
      ],
    }).compile()

    // 必须调用。compile() 本身不会触发
    // QueueWorkerBootstrap.onApplicationBootstrap()
    await testingModule.init()

    queue = testingModule.get<Queue>(getQueueToken(TASK_QUEUE_NAME))
    taskQueueService = testingModule.get(TaskQueueService)

    // QueueEvents 必须与 Queue 使用完全相同的
    // connection、DB 和 prefix。
    queueEvents = new QueueEvents(TASK_QUEUE_NAME, {
      connection: queue.opts.connection,
      prefix: queue.opts.prefix,
    })

    // 必须先 ready，再投递，避免错过完成事件。
    await queueEvents.waitUntilReady()
  })

  it('completes a Job through real Redis', async () => {
    if (!queue || !queueEvents || !taskQueueService) {
      throw new Error('Queue integration test was not initialized')
    }

    const queued = await taskQueueService.enqueue(
      TASK_JOB_NAMES.QUEUE_SMOKE,
      {
        marker: 'redis-smoke',
        enqueuedAt: new Date().toISOString(),
      },
      {
        jobId: 'queue-smoke-' + randomUUID(),
      },
    )

    const job = await queue.getJob(queued.jobId)

    if (!job) {
      throw new Error('Smoke Job was not found')
    }

    const result = await job.waitUntilFinished(queueEvents, 10_000)

    expect(result.marker).toBe('redis-smoke')
  }, 15_000)

  afterAll(async () => {
    try {
      await queueEvents?.close()

      if (queue) {
        if (queue.opts.prefix !== uniquePrefix) {
          throw new Error('Refusing to clean a non-test Queue prefix')
        }

        // 这里只清理由随机 Prefix 创建的测试队列。
        await queue.obliterate({ force: true })
      }
    } finally {
      try {
        await testingModule?.close()
      } finally {
        if (previousPrefix === undefined) {
          delete process.env.QUEUE_PREFIX
        } else {
          process.env.QUEUE_PREFIX = previousPrefix
        }

        if (previousWorkerEnabled === undefined) {
          delete process.env.QUEUE_WORKER_ENABLED
        } else {
          process.env.QUEUE_WORKER_ENABLED = previousWorkerEnabled
        }
      }
    }
  })
})
