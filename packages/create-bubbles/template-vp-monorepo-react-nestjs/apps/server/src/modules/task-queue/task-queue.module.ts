import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import type { QueueConfig } from '@/config/queue.config'
import { QueueWorkerBootstrap } from './queue-worker.bootstrap'
import { TASK_QUEUE_NAME } from './task-queue.constants'
import { TaskQueueProcessor } from './task-queue.processor'
import { TaskQueueService } from './task-queue.service'

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const queue = config.getOrThrow<QueueConfig>('queue')

        return {
          connection: {
            host: queue.host,
            port: queue.port,
            username: queue.username,
            password: queue.password,
            db: queue.db,
            connectTimeout: 10_000,
          },
          prefix: queue.prefix,
          defaultJobOptions: {
            attempts: queue.defaultAttempts,
            backoff: {
              type: 'exponential',
              delay: queue.backoffDelayMs,
            },
            removeOnComplete: {
              age: queue.completedAgeSeconds,
              count: queue.completedCount,
            },
            removeOnFail: {
              age: queue.failedAgeSeconds,
              count: queue.failedCount,
            },
          },
        }
      },
      extraOptions: {
        manualRegistration: true,
      },
    }),
    BullModule.registerQueue({
      name: TASK_QUEUE_NAME,
    }),
  ],
  providers: [QueueWorkerBootstrap, TaskQueueProcessor, TaskQueueService],
  exports: [TaskQueueService],
})
export class TaskQueueModule {}
