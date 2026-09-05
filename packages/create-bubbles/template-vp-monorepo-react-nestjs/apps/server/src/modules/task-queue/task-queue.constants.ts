/**
 * BullMQ 队列名称。
 *
 * 在 BullModule.registerQueue 注册、@InjectQueue 注入与 @Processor 绑定时共用，
 * 同时作为契约层的队列标识（见 EnqueuedTask.queueName）。
 */
export const TASK_QUEUE_NAME = 'server-tasks'

/**
 * Worker 并发数：单个 Processor 实例同时处理的任务数上限。
 */
export const TASK_QUEUE_CONCURRENCY = 5

/**
 * 任务名称注册表（全部任务的唯一来源）。
 *
 * 命名遵循 `域.动作.版本` 格式（如 `system.queue-smoke.v1`）。
 * 新增任务时在此登记，并需在 contracts 中同步补充对应的 payload 契约
 * （TaskPayloadMap 与 TASK_PAYLOAD_SCHEMAS）。
 */
export const TASK_JOB_NAMES = {
  /** 队列连通性冒烟测试任务。 */
  QUEUE_SMOKE: 'system.queue-smoke.v1',
} as const
