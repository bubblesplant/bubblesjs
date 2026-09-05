import type { Job } from 'bullmq'
import { UnrecoverableError } from 'bullmq'
import { describe, expect, it, vi } from 'vite-plus/test'
import { TASK_JOB_NAMES } from '@/modules/task-queue/task-queue.constants'
import { TaskQueueProcessor } from '@/modules/task-queue/task-queue.processor'

function createJob(name: string, data: unknown): Job {
  return { name, data } as unknown as Job
}

describe('TaskQueueProcessor', () => {
  it('completes a smoke task with marker and processedAt', async () => {
    const processor = new TaskQueueProcessor()

    const result = await processor.process(
      createJob(TASK_JOB_NAMES.QUEUE_SMOKE, {
        marker: 'smoke-marker',
        enqueuedAt: new Date().toISOString(),
      }),
    )

    expect(result).toMatchObject({ marker: 'smoke-marker' })
    expect(typeof (result as { processedAt: string }).processedAt).toBe('string')
    expect(Number.isNaN(Date.parse((result as { processedAt: string }).processedAt))).toBe(false)
  })

  it('throws UnrecoverableError for invalid payload', async () => {
    const processor = new TaskQueueProcessor()

    await expect(
      processor.process(
        createJob(TASK_JOB_NAMES.QUEUE_SMOKE, {
          marker: '',
          enqueuedAt: 'not-a-datetime',
        }),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('throws UnrecoverableError for unknown task names', async () => {
    const processor = new TaskQueueProcessor()

    await expect(processor.process(createJob('unknown.task.v1', { any: 'data' }))).rejects.toThrow(
      'Unsupported task name',
    )
  })

  it('does not swallow ordinary handler errors', async () => {
    const processor = new TaskQueueProcessor()
    const toISOString = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      throw new Error('clock failure')
    })

    await expect(
      processor.process(
        createJob(TASK_JOB_NAMES.QUEUE_SMOKE, {
          marker: 'smoke-marker',
          enqueuedAt: '2026-01-01T00:00:00.000Z',
        }),
      ),
    ).rejects.toThrow('clock failure')
  })
})
