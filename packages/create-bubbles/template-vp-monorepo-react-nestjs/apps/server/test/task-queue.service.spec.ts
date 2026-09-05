import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vite-plus/test'
import { TASK_JOB_NAMES } from '@/modules/task-queue/task-queue.constants'
import { TaskQueueService } from '@/modules/task-queue/task-queue.service'

function createQueue(add: ReturnType<typeof vi.fn> = vi.fn()) {
  return { add } as unknown as Queue
}

function validPayload() {
  return {
    marker: 'test',
    enqueuedAt: new Date().toISOString(),
  }
}

describe('TaskQueueService', () => {
  it('enqueues a typed task and converts jobId and delayMs', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'queue-smoke-1' })
    const service = new TaskQueueService(createQueue(add))

    const payload = validPayload()

    const result = await service.enqueue(TASK_JOB_NAMES.QUEUE_SMOKE, payload, {
      jobId: 'queue-smoke-1',
      delayMs: 100,
    })

    expect(add).toHaveBeenCalledOnce()
    expect(add).toHaveBeenCalledWith(TASK_JOB_NAMES.QUEUE_SMOKE, payload, {
      jobId: 'queue-smoke-1',
      delay: 100,
    })
    expect(result).toEqual({
      queueName: 'server-tasks',
      jobId: 'queue-smoke-1',
      name: TASK_JOB_NAMES.QUEUE_SMOKE,
    })
  })

  it('omits jobId and delay options when not provided', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'queue-smoke-2' })
    const service = new TaskQueueService(createQueue(add))
    const payload = validPayload()

    await service.enqueue(TASK_JOB_NAMES.QUEUE_SMOKE, payload)

    expect(add).toHaveBeenCalledWith(TASK_JOB_NAMES.QUEUE_SMOKE, payload, {})
  })

  it('rejects jobId containing a colon', async () => {
    const add = vi.fn()
    const service = new TaskQueueService(createQueue(add))

    await expect(
      service.enqueue(TASK_JOB_NAMES.QUEUE_SMOKE, validPayload(), { jobId: 'bad:id' }),
    ).rejects.toThrow('colon')

    expect(add).not.toHaveBeenCalled()
  })

  it('rejects negative delayMs', async () => {
    const add = vi.fn()
    const service = new TaskQueueService(createQueue(add))

    await expect(
      service.enqueue(TASK_JOB_NAMES.QUEUE_SMOKE, validPayload(), { delayMs: -1 }),
    ).rejects.toThrow('non-negative')

    expect(add).not.toHaveBeenCalled()
  })

  it('rejects non-safe-integer delayMs', async () => {
    const add = vi.fn()
    const service = new TaskQueueService(createQueue(add))

    await expect(
      service.enqueue(TASK_JOB_NAMES.QUEUE_SMOKE, validPayload(), { delayMs: 1.5 }),
    ).rejects.toThrow('non-negative')

    expect(add).not.toHaveBeenCalled()
  })

  it('rejects invalid payload before reaching the queue', async () => {
    const add = vi.fn()
    const service = new TaskQueueService(createQueue(add))

    await expect(
      service.enqueue(TASK_JOB_NAMES.QUEUE_SMOKE, {
        marker: '',
        enqueuedAt: 'not-a-datetime',
      }),
    ).rejects.toThrow()

    expect(add).not.toHaveBeenCalled()
  })

  it('throws when BullMQ returns a Job without an id', async () => {
    const add = vi.fn().mockResolvedValue({ id: undefined })
    const service = new TaskQueueService(createQueue(add))

    await expect(service.enqueue(TASK_JOB_NAMES.QUEUE_SMOKE, validPayload())).rejects.toThrow(
      'without an id',
    )
  })
})
