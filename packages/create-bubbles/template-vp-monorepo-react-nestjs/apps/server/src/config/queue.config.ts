import { registerAs } from '@nestjs/config'

export interface QueueConfig {
  /** 队列专用 Redis 地址。来自 QUEUE_REDIS_HOST，缺省 localhost。独立于 Session Redis，不与其共用连接配置。 */
  host: string
  /** 队列专用 Redis 端口。来自 QUEUE_REDIS_PORT，缺省 6379，取值范围 1~65535。 */
  port: number
  /** Redis ACL 用户名（Redis 6+），来自 QUEUE_REDIS_USERNAME。可选，无认证开发环境可留空。 */
  username?: string
  /** Redis 密码，来自 QUEUE_REDIS_PASSWORD。可选；生产值应放部署 Secret，不提交进 Git。 */
  password?: string
  /**
   * Redis 逻辑库编号。来自 QUEUE_REDIS_DB。
   * 约定：开发环境 Session 用 DB 0、队列用 DB 1，便于隔离查看；生产建议独立 Redis 且用 DB 0；Redis Cluster 只支持 DB 0。
   */
  db: number
  /**
   * 所有队列 key 的统一前缀。来自 QUEUE_PREFIX，缺省 `bubbles:{NODE_ENV}:queue`。
   * 用于区分项目和环境、避免不同环境撞键。注意：这是 BullMQ 自身的 prefix，不要配置 ioredis 的 keyPrefix。
   */
  prefix: string
  /**
   * 当前 NestJS 进程是否启动 BullMQ Worker（消费者）。来自 QUEUE_WORKER_ENABLED，严格解析 true/false。
   * 设为 false 时仍可投递任务，但本进程不消费，为以后拆分独立 Worker 进程留出入口。
   */
  workerEnabled: boolean
  /** 单个任务的总执行次数上限。来自 QUEUE_DEFAULT_ATTEMPTS，缺省 3。注意是“总共最多 3 次”，不是首次外加 3 次重试。 */
  defaultAttempts: number
  /** 重试退避的基础延迟（毫秒），配合指数退避使用。来自 QUEUE_BACKOFF_DELAY_MS，缺省 1000，即 1s、2s、4s…。 */
  backoffDelayMs: number
  /** 已完成任务（removeOnComplete.age）的保留时长（秒），超时自动清理。来自 QUEUE_COMPLETED_AGE_SECONDS，缺省 86400（24 小时）。 */
  completedAgeSeconds: number
  /** 已完成任务（removeOnComplete.count）的最大保留条数。来自 QUEUE_COMPLETED_COUNT，缺省 1000。与保留时长同时生效，防止 Redis 无限增长。 */
  completedCount: number
  /** 失败任务（removeOnFail.age）的保留时长（秒）。来自 QUEUE_FAILED_AGE_SECONDS，缺省 604800（7 天），比成功任务留得更久，便于排查。 */
  failedAgeSeconds: number
  /** 失败任务（removeOnFail.count）的最大保留条数。来自 QUEUE_FAILED_COUNT，缺省 5000。 */
  failedCount: number
}

function readInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const rawValue = (process.env[name] ?? String(fallback)).trim()
  const value = Number(rawValue)

  if (rawValue === '' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(name + ' must be an integer between ' + minimum + ' and ' + maximum)
  }

  return value
}

function readBoolean(name: string, fallback: boolean) {
  const rawValue = process.env[name]

  if (rawValue === undefined) {
    return fallback
  }

  const value = rawValue.trim().toLowerCase()

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  throw new Error(name + ' must be true or false')
}

function readOptionalText(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export default registerAs('queue', (): QueueConfig => {
  const environment = process.env.NODE_ENV ?? 'development'
  const prefix = process.env.QUEUE_PREFIX?.trim() || ['bubbles', environment, 'queue'].join(':')

  if (!prefix) {
    throw new Error('QUEUE_PREFIX must not be empty')
  }

  return {
    host: process.env.QUEUE_REDIS_HOST?.trim() || 'localhost',
    port: readInteger('QUEUE_REDIS_PORT', 6379, 1, 65_535),
    username: readOptionalText('QUEUE_REDIS_USERNAME'),
    password: readOptionalText('QUEUE_REDIS_PASSWORD'),
    db: readInteger('QUEUE_REDIS_DB', 1, 0),
    prefix,
    workerEnabled: readBoolean('QUEUE_WORKER_ENABLED', true),
    defaultAttempts: readInteger('QUEUE_DEFAULT_ATTEMPTS', 3, 1),
    backoffDelayMs: readInteger('QUEUE_BACKOFF_DELAY_MS', 1_000, 1),
    completedAgeSeconds: readInteger('QUEUE_COMPLETED_AGE_SECONDS', 86_400, 1),
    completedCount: readInteger('QUEUE_COMPLETED_COUNT', 1_000, 1),
    failedAgeSeconds: readInteger('QUEUE_FAILED_AGE_SECONDS', 604_800, 1),
    failedCount: readInteger('QUEUE_FAILED_COUNT', 5_000, 1),
  }
})
