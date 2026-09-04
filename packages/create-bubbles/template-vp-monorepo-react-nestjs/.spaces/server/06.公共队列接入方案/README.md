# NestJS BullMQ 公共任务队列接入方案

> 状态：实施方案，尚未修改代码  
> 基线日期：2026-09-03  
> 适用范围：apps/server、Redis、BullMQ  
> 面向读者：以前端开发为主、刚开始搭建 NestJS 后端的开发者  
> 本文目标：先建立一套所有后端业务都能复用的公共队列能力，不实现上传清理或其他真实业务任务。

## 0. 结论先行

本项目第一版公共队列采用：

- BullMQ
- @nestjs/bullmq
- 当前已有的 Redis
- 一个默认物理队列 server-tasks
- 一个公共投递入口 TaskQueueService
- 一个公共 Worker：TaskQueueProcessor
- 使用 job.name 区分任务类型，例如 system.queue-smoke.v1、email.send.v1

最终调用关系如下：

```text
AuthModule / UploadModule / 未来业务模块
                  │
                  │ 注入 TaskQueueService
                  │ enqueue(任务名, 小型 Payload)
                  ▼
          BullMQ: server-tasks
                  │
             Redis DB 1
                  │
                  ▼
        TaskQueueProcessor
                  │
          根据 job.name 分发
                  ▼
             具体任务处理逻辑
```

这一版先把“公共道路”修好，暂时不往道路上放真实业务车辆。唯一允许加入的是无业务含义的冒烟任务 system.queue-smoke.v1，用来证明：

```text
成功投递
  → Redis 中出现 Job
  → Worker 收到 Job
  → Job 执行完成
```

### 0.1 为什么选 BullMQ

| 方案                  | 优点                                          | 当前不选或选择的原因                                           |
| --------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Node.js 内存队列      | 最简单                                        | 服务重启就丢任务，多实例也无法共享，不适合作为后端公共能力     |
| PostgreSQL 轮询任务表 | 可与业务数据靠得更近                          | 需要自己实现抢占、锁、重试、延时和清理；以后做 Outbox 时再引入 |
| RabbitMQ              | 成熟、功能完整                                | 当前项目规模下运维和学习成本偏高                               |
| Kafka                 | 吞吐高，适合事件流                            | 不适合当前普通后台任务场景，明显过重                           |
| BullMQ + Redis        | NestJS 接入自然，支持重试、延时、并发和持久化 | 适合当前项目，采用                                             |

不要安装旧的 @nestjs/bull。本方案统一使用 @nestjs/bullmq。

截至本文基线日期，建议版本为：

```yaml
'@nestjs/bullmq': ^12.0.0
bullmq: ^6.3.4
```

这组版本兼容当前项目的 NestJS 11。

### 0.2 第一版为什么只建一个物理队列

server-tasks 适合邮件、通知、轻量文件处理、普通第三方接口调用等任务。这样配置少、理解成本低，足够支撑项目初期。

以下任务以后应拆成独立物理队列和独立 Worker：

- AI 推理
- 视频转码
- CPU 密集计算
- 超大文件处理
- 需要完全不同并发量或超时策略的任务
- 需要独立扩容、独立发布或独立故障隔离的任务

即使以后拆队列，业务模块仍然应从公共 TaskQueueService 进入，不要各自直接连接 Redis。

### 0.3 搭完后，后端项目是不是基本成型

可以说“后端基础设施骨架基本成型”，但不能说“已经可以直接生产上线”。

搭完本方案后，项目已经具备：

- NestJS 应用骨架
- PostgreSQL 数据访问
- Redis 与 Session
- 认证基础
- 对象存储与上传基础
- 可复用的异步任务队列
- 基础错误处理、配置加载、测试和构建流程

仍然需要随着业务继续完善：

- 真实业务模块和权限模型
- 队列任务的幂等实现
- 日志、指标和告警
- 数据库与 Redis 备份恢复
- 限流、安全加固和密钥管理
- CI/CD、灰度发布和回滚
- 强一致投递场景所需的 Transactional Outbox

所以准确结论是：骨架成型，业务和生产保障还要继续补。

---

## 1. 前端开发者先理解五个概念

可以把队列理解成餐厅取号。

| 队列概念 | 餐厅类比             | 在本项目中的角色   |
| -------- | -------------------- | ------------------ |
| Queue    | 等候区               | server-tasks       |
| Job      | 一张号码单           | 一次具体任务       |
| Producer | 发号机               | TaskQueueService   |
| Worker   | 后厨                 | TaskQueueProcessor |
| Redis    | 保存号码和状态的系统 | 队列数据存储       |

最容易误解的一点是：

```ts
await taskQueueService.enqueue(...)
```

只表示任务已经成功写入队列，不表示任务已经执行完成。

将来 HTTP 接口投递异步任务时，通常返回：

```json
{
  "jobId": "some-job-id",
  "status": "queued"
}
```

HTTP 状态可使用 202 Accepted。前端不能直接连接 Redis。如果前端以后需要查询长任务进度，应再增加数据库任务表和查询接口；这不属于本次公共队列基础搭建。

---

## 2. 本次范围

### 2.1 本次包含

- 安装 BullMQ 依赖
- 队列专用环境配置
- 队列配置校验
- 默认物理队列注册
- 类型安全的任务名称与 Payload 契约
- 公共投递服务
- 公共 Worker
- 重试、指数退避和任务保留上限
- Worker 启停开关
- 优雅停机
- 单元测试和真实 Redis 冒烟测试
- 后续新任务接入模板

### 2.2 本次不包含

- 上传清理的真实实现
- 邮件、通知、AI、视频等真实业务任务
- 定时任务
- Bull Board 管理界面
- async_tasks 数据库表
- SSE 或 WebSocket 进度推送
- 独立 Worker 应用
- Transactional Outbox

上传清理只作为未来附加项，详细说明见 [上传清理.md](./上传清理.md)，当前不实现。

---

## 3. 当前项目基线

| 项目               | 当前状态                  | 本方案处理                            |
| ------------------ | ------------------------- | ------------------------------------- |
| NestJS             | 11.1.x，Fastify           | 使用 @nestjs/bullmq 12                |
| Redis              | Redis 8，已开启 AOF       | 本地复用 Redis，队列使用 DB 1         |
| Session            | 使用 Redis DB 0           | 与队列配置分开                        |
| Session Redis 连接 | 面向 HTTP 快速失败        | 绝不把现有 Redis Client 注入 BullMQ   |
| BullMQ             | 尚未安装                  | 加入 workspace catalog 和 server 依赖 |
| Shutdown Hooks     | main.ts 尚未开启          | 增加 app.enableShutdownHooks()        |
| Server 测试        | 只匹配 test/\*_/_.spec.ts | 队列测试必须放 apps/server/test       |
| 环境文件           | 已有分层加载              | 沿用现有 ENV_ARR 顺序                 |

当前 Session Redis 使用了 commandTimeout、maxRetriesPerRequest 和 enableOfflineQueue 等请求链路策略。Worker 需要长期阻塞取任务和断线恢复，因此不能复用该 Redis 实例，也不要把这些参数原样复制到 BullMQ。

BullMQ 应接收一份普通 Redis 连接配置对象，由它为 Queue 和 Worker 创建、管理各自的连接。

---

## 4. 最终文件结构

完成本方案后，建议形成：

```text
apps/server/src/config/
└── queue.config.ts

apps/server/src/modules/task-queue/
├── queue-worker.bootstrap.ts
├── task-queue.constants.ts
├── task-queue.contracts.ts
├── task-queue.module.ts
├── task-queue.processor.ts
└── task-queue.service.ts

apps/server/test/
├── task-queue.processor.spec.ts
├── task-queue.service.spec.ts
└── task-queue.integration.spec.ts
```

同时修改：

```text
pnpm-workspace.yaml
apps/server/package.json
apps/server/.env.development
apps/server/.env.production
apps/server/src/config/index.ts
apps/server/src/app.module.ts
apps/server/src/main.ts
```

---

## 5. 公共队列必须先定下的规则

### 5.1 队列名

第一版只有一个物理队列：

```text
server-tasks
```

### 5.2 任务名

任务名统一采用：

```text
领域.动作.v版本
```

示例：

```text
system.queue-smoke.v1
email.send.v1
notification.push.v1
```

Payload 或行为发生不兼容修改时，必须升级任务版本，不能悄悄改变旧任务含义。

### 5.3 Payload

Payload 只传：

- 数据库记录 ID
- 对象 ID
- 少量执行参数
- 必要的追踪字段

禁止传：

- Buffer
- 文件正文
- 大段 Base64
- 完整数据库实体
- 登录 Token
- Redis、数据库或对象存储密钥
- 无法 JSON 序列化的数据

Worker 真正执行时，应根据 ID 重新读取数据库，不能相信队列中保存的是最新业务状态。

### 5.4 投递和执行语义

BullMQ 是“至少执行一次”，不是“恰好执行一次”。

同一个任务可能因为进程崩溃、锁丢失、网络中断或调用方重试而再次执行。因此每个真实任务处理器都必须幂等。

常见幂等手段：

- 数据库唯一约束
- 带当前状态条件的 UPDATE
- 独立幂等键
- 调用外部服务时传稳定幂等键
- 发现目标已经完成时直接成功返回

自定义 jobId 只能降低重复投递概率，不能替代业务幂等。

### 5.5 每个进程中，一个物理队列只注册一种公共分发 Processor

不要给同一个 server-tasks 队列中的每个任务分别写一个 @Processor。

错误理解：

```text
EmailProcessor 只会拿 email.send.v1
UploadProcessor 只会拿 upload.cleanup.v1
```

实际上，多个 Worker 会竞争同一队列中的所有 Job，并不会按 job.name 自动绑定。EmailProcessor 可能拿到上传任务。

正确做法：

```text
server-tasks
    │
    ▼
唯一一种 TaskQueueProcessor
（每个启用 Worker 的副本各有一个同构实例）
    │
    ├── job.name = email.send.v1
    ├── job.name = notification.push.v1
    └── job.name = ...
```

第一版在公共 Processor 中分发。横向扩容时可以运行多个同构 Worker 实例；关键是它们都必须认识该物理队列中的全部 job.name，不能按任务名拆成互不相识的 Processor 类型。

任务数量明显增加后，可再升级成 Handler Registry，但仍保持每个进程只注册一种能处理全部任务名的公共 WorkerHost。

---

## 6. 第 1 步：安装依赖

### 本步目标

把 BullMQ 加入 workspace catalog，并让 Server 使用 catalog 版本。

### 文件位置

```text
pnpm-workspace.yaml
apps/server/package.json
```

### 精确修改

在 pnpm-workspace.yaml 的 catalog 中加入：

```yaml
'@nestjs/bullmq': ^12.0.0
bullmq: ^6.3.4
```

在 apps/server/package.json 的 dependencies 中加入：

```json
{
  "@nestjs/bullmq": "catalog:",
  "bullmq": "catalog:"
}
```

### 验证

在仓库根目录执行：

```powershell
vp install
vp run --filter server build
```

### 常见错误

- 安装成 @nestjs/bull。
- 只安装 @nestjs/bullmq，没有安装 bullmq。
- 在 Server 中写死版本，没有使用 catalog。
- 同时混用 Bull 和 BullMQ 的装饰器。

---

## 7. 第 2 步：增加队列环境变量

### 本步目标

让队列拥有独立于 Session Redis 的配置入口。

### 文件位置

开发环境建议修改：

```text
apps/server/.env.development
```

个人本机密码等值应放：

```text
apps/server/.env.development.local
```

生产变量写入部署平台 Secret，不要把真实密码提交到 Git。

当前项目环境文件优先级为：

```text
.env.<环境>.local
→ .env.local
→ .env.<环境>
→ .env
```

### 建议变量

```dotenv
# BullMQ 基础连接
QUEUE_REDIS_HOST=localhost
QUEUE_REDIS_PORT=6379
QUEUE_REDIS_USERNAME=
# 下面只是占位值，必须替换；不能原样复制使用
QUEUE_REDIS_PASSWORD=YOUR_LOCAL_REDIS_PASSWORD
QUEUE_REDIS_DB=1
QUEUE_PREFIX=bubbles:development:queue

# 当前 NestJS 进程是否启动 Worker
QUEUE_WORKER_ENABLED=true

# 默认任务策略
QUEUE_DEFAULT_ATTEMPTS=3
QUEUE_BACKOFF_DELAY_MS=1000
QUEUE_COMPLETED_AGE_SECONDS=86400
QUEUE_COMPLETED_COUNT=1000
QUEUE_FAILED_AGE_SECONDS=604800
QUEUE_FAILED_COUNT=5000
```

生产建议：

```dotenv
# 下面两个 YOUR_... 都只是占位值，必须由部署配置或 Secret 替换
QUEUE_REDIS_HOST=YOUR_QUEUE_REDIS_HOST
QUEUE_REDIS_PORT=6379
QUEUE_REDIS_USERNAME=
QUEUE_REDIS_PASSWORD=YOUR_PRODUCTION_QUEUE_REDIS_PASSWORD
QUEUE_REDIS_DB=0
QUEUE_PREFIX=bubbles:production:queue
QUEUE_WORKER_ENABLED=true
```

### 代码解释

- 本地 Session 使用 DB 0，队列使用 DB 1，便于查看和清理。
- Redis DB 只是逻辑隔离，不是性能、安全或故障隔离。
- 生产推荐队列使用独立 Redis，并使用 DB 0。
- Redis Cluster 只支持 DB 0。
- QUEUE_PREFIX 用于区分项目和环境。
- 不要配置 ioredis 的 keyPrefix。BullMQ 必须使用自己的 prefix。
- 不要把字符串 false 写成 Boolean(process.env.QUEUE_WORKER_ENABLED)，因为 Boolean('false') 仍然是 true。

### 验证

确认本地 Redis 可用。把命令中的占位密码替换为自己的本地值：

```powershell
docker compose up -d redis
$queueRedisPassword = Read-Host '请输入本地 Redis 密码'
docker compose exec -e REDISCLI_AUTH=$queueRedisPassword redis redis-cli -n 1 ping
Remove-Variable queueRedisPassword
```

预期输出：

```text
PONG
```

### 常见错误

- 队列仍然使用 REDIS_DB=0，和 Session 键混在一起。
- 把生产密码写入 .env.production 并提交。
- Prefix 在开发、测试、生产环境完全相同。
- 使用 Redis Cluster 时仍配置 DB 1。

---

## 8. 第 3 步：建立 queue.config.ts

### 本步目标

集中读取并校验所有队列变量。配置错误时让应用启动失败，而不是运行到一半才发现。

### 文件位置

新建：

```text
apps/server/src/config/queue.config.ts
```

### 完整代码

```ts
import { registerAs } from '@nestjs/config'

export interface QueueConfig {
  host: string
  port: number
  username?: string
  password?: string
  db: number
  prefix: string
  workerEnabled: boolean
  defaultAttempts: number
  backoffDelayMs: number
  completedAgeSeconds: number
  completedCount: number
  failedAgeSeconds: number
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
```

### 代码解释

- 所有数字先转成整数，再做范围校验。
- 密码和用户名允许为空，方便连接无认证的开发 Redis。
- QUEUE_WORKER_ENABLED 被严格解析成 true 或 false。
- 默认 Prefix 自动带 NODE_ENV，避免不同环境撞键。
- 配置文件只负责读取配置，不创建 Redis Client。

### 常见错误

- 使用 Number.parseInt 后不检查 NaN。
- 用 Boolean('false') 解析环境变量。
- 在配置文件中直接 new Redis。
- 把 Session Redis 配置对象整个复制过来。

---

## 9. 第 4 步：注册 queueConfig

### 本步目标

让 ConfigService 可以读取 queue 配置。

### 文件位置

修改：

```text
apps/server/src/config/index.ts
apps/server/src/app.module.ts
```

### 精确修改

在 apps/server/src/config/index.ts 增加：

```ts
export { default as queueConfig } from './queue.config'
```

在 AppModule 顶部的配置导入中加入 queueConfig：

```ts
import {
  appConfig,
  databaseConfig,
  llmConfig,
  queueConfig,
  redisConfig,
  sessionConfig,
  storageConfig,
} from '@/config'
```

把 ConfigModule.forRoot 的 load 改为：

```ts
load: [
  appConfig,
  databaseConfig,
  llmConfig,
  queueConfig,
  redisConfig,
  sessionConfig,
  storageConfig,
],
```

### 验证

```powershell
vp run --filter server build
```

如果 QUEUE_REDIS_PORT 等变量不合法，构建通常不会读取运行环境，但启动 Server 时必须立即报出清晰的配置错误。

---

## 10. 第 5 步：定义队列名和任务契约

### 本步目标

集中定义物理队列名、任务名和 Payload 类型，避免业务模块随手拼字符串。

### 文件位置

新建：

```text
apps/server/src/modules/task-queue/task-queue.constants.ts
apps/server/src/modules/task-queue/task-queue.contracts.ts
```

### task-queue.constants.ts

```ts
export const TASK_QUEUE_NAME = 'server-tasks'

export const TASK_QUEUE_CONCURRENCY = 5

export const TASK_JOB_NAMES = {
  QUEUE_SMOKE: 'system.queue-smoke.v1',
} as const
```

### task-queue.contracts.ts

```ts
import { z } from 'zod'
import { TASK_JOB_NAMES, TASK_QUEUE_NAME } from './task-queue.constants'

export const QueueSmokePayloadSchema = z.object({
  marker: z.string().min(1).max(100),
  enqueuedAt: z.string().datetime(),
})

export type TaskName = (typeof TASK_JOB_NAMES)[keyof typeof TASK_JOB_NAMES]

export interface TaskPayloadMap {
  [TASK_JOB_NAMES.QUEUE_SMOKE]: z.infer<typeof QueueSmokePayloadSchema>
}

export const TASK_PAYLOAD_SCHEMAS = {
  [TASK_JOB_NAMES.QUEUE_SMOKE]: QueueSmokePayloadSchema,
} satisfies Record<TaskName, z.ZodType>

export function parseTaskPayload<Name extends TaskName>(
  name: Name,
  payload: unknown,
): TaskPayloadMap[Name] {
  return TASK_PAYLOAD_SCHEMAS[name].parse(payload) as TaskPayloadMap[Name]
}

export interface EnqueueTaskOptions {
  jobId?: string
  delayMs?: number
}

export interface EnqueuedTask<Name extends TaskName = TaskName> {
  queueName: typeof TASK_QUEUE_NAME
  jobId: string
  name: Name
}
```

### 代码解释

- TASK_QUEUE_NAME 是 Redis 中的物理队列。
- TASK_JOB_NAMES 是任务协议，不允许业务代码手写字符串。
- TaskPayloadMap 建立“任务名 → Payload 类型”的对应关系。
- TypeScript 保护正常后端调用。
- Zod 保护 Redis 中遗留的旧任务、错误生产者和运行时脏数据。
- 冒烟任务只用于验证基础设施，不承载业务。

### 常见错误

- 任务名没有版本号。
- 多个文件分别定义相同字符串。
- 只写 TypeScript interface，不做 Worker 运行时校验。
- 在 Payload 中放完整文件内容。

---

## 11. 第 6 步：实现公共投递服务

### 本步目标

让所有业务模块只通过 TaskQueueService 投递任务，不直接操作 BullMQ Queue。

### 文件位置

新建：

```text
apps/server/src/modules/task-queue/task-queue.service.ts
```

### 完整代码

```ts
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
```

### 代码解释

- 业务层拿不到 pause、clean、drain、obliterate 等危险方法。
- 对外只返回 queueName、jobId 和 name，不泄漏整个 BullMQ Job。
- Service 在投递前做一次 Zod 校验。
- 默认重试和保留规则由公共模块统一提供，业务不能随意覆盖。
- jobId 不能包含冒号。

不要在这里为 queue.add 层层添加 catch。未知 Redis 异常应继续向上交给项目现有全局异常过滤器。只有以后明确需要转换为某个公开 503 错误时，才在这个基础设施边界转换一次。

### jobId 的边界

相同 jobId 在旧 Job 仍保留于队列时，可以阻止重复加入。但 Job 被自动清理后，这个 jobId 可以再次投递。

因此：

```text
jobId 去重 ≠ 业务恰好执行一次
```

真实处理器仍必须使用数据库约束或状态条件保证幂等。

---

## 12. 第 7 步：实现公共分发 Worker

### 本步目标

在每个启用 Worker 的进程中，为 server-tasks 建立唯一一种公共 WorkerHost，并先支持基础设施冒烟任务。

### 文件位置

新建：

```text
apps/server/src/modules/task-queue/task-queue.processor.ts
```

### 完整代码

```ts
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
```

### 代码解释

- concurrency: 5 表示单个 NestJS 实例最多同时执行 5 个任务。
- 冒烟任务返回 marker 和处理时间，只验证完整链路。
- 未知任务名和非法 Payload 不会因为重试而自动变正确，所以使用 UnrecoverableError。
- 真实任务遇到数据库暂时不可用、第三方超时等可恢复错误时，不要吞掉异常，让 BullMQ 按公共策略重试。
- 日志只记录任务元数据，不记录完整 Payload。
- 第一版也不直接记录原始 error.message 和 error.stack，避免第三方 SDK、SQL 或连接错误把敏感信息带进日志。以后如需完整错误诊断，应先接入统一的日志脱敏函数。

### 绝对不要这样写

```ts
try {
  await doRealWork()
} catch (error) {
  return { ok: false }
}
```

这样 Worker 会把失败任务标记为 completed，BullMQ 不会重试。

正确做法是让异常继续抛出：

```ts
await doRealWork()
return { ok: true }
```

### 多实例并发

如果部署 3 个 API 副本，并且每个副本都启用 Worker：

```text
总并发 = 3 × 5 = 15
```

这不是错误，但上线前必须清楚总并发会放大。

---

## 13. 第 8 步：增加 Worker 启动开关

### 本步目标

同一套代码既可以“投递并消费”，也可以只投递不消费，为以后拆 Worker 进程留出入口。

### 文件位置

新建：

```text
apps/server/src/modules/task-queue/queue-worker.bootstrap.ts
```

### 完整代码

```ts
import { BullRegistrar } from '@nestjs/bullmq'
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class QueueWorkerBootstrap implements OnApplicationBootstrap {
  private registered = false

  constructor(
    private readonly config: ConfigService,
    private readonly registrar: BullRegistrar,
  ) {}

  onApplicationBootstrap() {
    const workerEnabled = this.config.getOrThrow<boolean>('queue.workerEnabled')

    if (!workerEnabled || this.registered) {
      return
    }

    this.registrar.register()
    this.registered = true
  }
}
```

### 代码解释

- @nestjs/bullmq 默认会自动启动所有 Processor。
- 下一步会开启 manualRegistration，改为由 QueueWorkerBootstrap 决定是否启动。
- onApplicationBootstrap 发生在模块初始化之后，配置已经可读取。
- 不要在 @Processor 装饰器参数中直接读取 .env。

---

## 14. 第 9 步：组装 TaskQueueModule

### 本步目标

统一注册 BullMQ、默认队列、公共 Service 和 Worker。

### 文件位置

新建：

```text
apps/server/src/modules/task-queue/task-queue.module.ts
```

### 完整代码

```ts
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
```

### 连接策略解释

这份 connection 必须是普通配置对象，不能是现有 Session ioredis 实例。

第一版单进程 Queue + Worker 建议：

- 设置 connectTimeout。
- 不设置 commandTimeout。
- 不设置 enableOfflineQueue。
- 不显式设置 maxRetriesPerRequest。

BullMQ 会为 Worker 的阻塞连接自动使用适合长期消费的 maxRetriesPerRequest: null；普通 Queue 连接保留 ioredis 默认行为。

如果以后真正拆成独立 Producer 和 Worker 进程，再进一步配置：

- API Producer：maxRetriesPerRequest: 1，快速失败。
- Worker：maxRetriesPerRequest: null，持续重连。

不要在当前共享配置里显式写 maxRetriesPerRequest: 1。BullMQ 虽然会为 Worker 覆盖它，但会输出警告。

### manualRegistration 的作用范围

manualRegistration 配置在 BullModule.forRootAsync 上，是当前 Nest 应用中 BullMQ 根模块级的全局开关，不只控制 server-tasks。调用 BullRegistrar.register() 时，会注册应用内所有 BullMQ Processor 和 QueueEvents Listener。

因此第一版的 QUEUE_WORKER_ENABLED 是“当前进程是否启动全部 BullMQ 消费者”的进程级开关。未来新增物理队列时，也会受到同一个开关控制；不要为了单独控制某个队列再创建第二套 BullModule.forRoot 或 forRootAsync 根配置。若以后确实需要不同队列独立启停，优先拆成独立 Worker 应用或重新设计更细粒度的消费者开关。

### 默认任务策略解释

- attempts: 3 表示总共最多执行 3 次，不是“首次加重试 3 次”。
- backoff 使用指数退避，避免外部服务故障时持续猛打。
- removeOnComplete 同时限制保留时间和数量。
- removeOnFail 保留更久，方便排查，但同样设置数量上限。
- 没有保留上限会让 Redis 数据持续增长。

### 为什么暂时不加 @Global

需要投递任务的业务模块应显式导入 TaskQueueModule：

```ts
@Module({
  imports: [TaskQueueModule],
})
export class SomeBusinessModule {}
```

这样依赖更清晰，测试时也更容易看出模块缺少什么。

### 不需要的旧组件

BullMQ 当前版本不需要额外创建 QueueScheduler。不要复制旧教程中的 QueueScheduler 或 @Process 写法。

---

## 15. 第 10 步：接入 AppModule

### 本步目标

让应用启动时创建 Queue，并根据开关决定是否启动 Worker。

### 文件位置

修改：

```text
apps/server/src/app.module.ts
```

### 精确修改

增加导入：

```ts
import { TaskQueueModule } from './modules/task-queue/task-queue.module'
```

在 imports 中加入：

```ts
TaskQueueModule,
```

建议放在 RedisModule 之后、具体业务模块之前，便于阅读：

```ts
imports: [
  ConfigModule.forRoot(...),
  DatabaseModule,
  RedisModule.forRootAsync(...),
  TaskQueueModule,
  TestRedisModule,
  TestDbModule,
  AuthModule,
  UploadModule,
],
```

TaskQueueModule 只需在 AppModule 中接入一次以确保 Worker 启动。需要投递任务的具体业务模块仍显式导入它，以获得 TaskQueueService。

---

## 16. 第 11 步：开启优雅停机

### 本步目标

让 NestJS 在收到 SIGTERM 或 SIGINT 时关闭 Queue 和 Worker，不再领取新任务，并等待当前任务正常结束。

### 文件位置

修改：

```text
apps/server/src/main.ts
```

### 精确修改

在 NestFactory.create 完成后增加：

```ts
app.enableShutdownHooks()
```

建议位置：

```ts
const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
  logger: new ConsoleLogger({
    json: process.env.NODE_ENV === 'production',
    colors: process.env.NODE_ENV === 'development',
  }),
})

app.enableShutdownHooks()

app.enableCors({
  // 保留当前配置
})
```

### 代码解释

- @nestjs/bullmq 会关闭自己注册的 Queue。
- Worker.close() 会停止领取新 Job，并等待当前 Job 结束。
- 部署平台的 termination grace period 必须大于普通任务的最长执行时间。
- 不需要再重复编写 process.on('SIGTERM')。

如果进程最终仍被强杀，正在执行的任务之后可能被判定为 stalled 并再次执行，这也是处理器必须幂等的原因。

---

## 17. 第 12 步：增加单元测试

### 本步目标

不连接 Redis，先验证公共 Service 和 Worker 分发规则。

### 文件位置

新建：

```text
apps/server/test/task-queue.service.spec.ts
apps/server/test/task-queue.processor.spec.ts
```

注意：当前 Server 的 Vite+ 测试配置只匹配 test/\*_/_.spec.ts。不要把测试放在 src 目录。

### TaskQueueService 至少测试

- 合法任务被传给 queue.add。
- jobId 和 delayMs 被正确转换。
- 返回值不暴露完整 Job。
- jobId 含冒号时拒绝。
- delayMs 为负数或非安全整数时拒绝。
- Payload 不合法时拒绝。

测试可直接模拟 Queue：

```ts
import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vite-plus/test'
import { TASK_JOB_NAMES } from '@/modules/task-queue/task-queue.constants'
import { TaskQueueService } from '@/modules/task-queue/task-queue.service'

describe('TaskQueueService', () => {
  it('enqueues a typed task', async () => {
    const add = vi.fn().mockResolvedValue({
      id: 'queue-smoke-1',
    })
    const queue = { add } as unknown as Queue
    const service = new TaskQueueService(queue)

    const result = await service.enqueue(
      TASK_JOB_NAMES.QUEUE_SMOKE,
      {
        marker: 'test',
        enqueuedAt: new Date().toISOString(),
      },
      {
        jobId: 'queue-smoke-1',
        delayMs: 100,
      },
    )

    expect(add).toHaveBeenCalledOnce()
    expect(result).toEqual({
      queueName: 'server-tasks',
      jobId: 'queue-smoke-1',
      name: TASK_JOB_NAMES.QUEUE_SMOKE,
    })
  })
})
```

### TaskQueueProcessor 至少测试

- 合法冒烟任务返回 marker 和 processedAt。
- 非法 Payload 抛出 UnrecoverableError。
- 未知任务名抛出 UnrecoverableError。
- 普通业务异常不会被吞掉。

### 验证

```powershell
vp run --filter server test
```

---

## 18. 第 13 步：增加真实 Redis 冒烟测试

### 本步目标

证明真正的“投递 → 消费 → 完成”链路可用。只 Mock Queue 不能证明 Redis 和 Worker 已正确接通。

### 文件位置

新建：

```text
apps/server/test/task-queue.integration.spec.ts
```

### 为什么默认跳过

这个文件仍使用 `.spec.ts` 后缀，所以普通 `vp run --filter server test` 和根目录 `vp run ready` 都能发现它。为了避免没有启动 Redis 时单元测试整体失败，真实 Redis 测试必须通过 `RUN_QUEUE_INTEGRATION=true` 显式开启；未设置时使用 `describe.skip`。

### 测试流程

```text
生成唯一测试 Prefix
  ↓
创建 ConfigModule + TaskQueueModule
  ↓
等待 TestingModule 完成初始化
  ↓
创建 QueueEvents 并等待 ready
  ↓
通过 TaskQueueService 投递 system.queue-smoke.v1
  ↓
根据 jobId 取得 Job
  ↓
最多等待 5～10 秒
  ↓
断言状态为 completed，并校验返回 marker
  ↓
关闭 QueueEvents
  ↓
关闭 TestingModule
```

测试 Prefix 必须唯一，例如：

```text
bubbles:test:<随机UUID>:queue
```

不要让集成测试连接开发或生产 Prefix 后执行 drain、clean 或 obliterate。

### 完整测试文件

因为公共模块使用了 manualRegistration: true，只执行 compile() 不会启动 Worker。测试必须显式执行 testingModule.init()，让 QueueWorkerBootstrap 的 onApplicationBootstrap 得到调用。

同时必须使用 ConfigModule.forRoot 注册 queueConfig，并且要在编译模块之前设置唯一测试 Prefix。下面是一份可以直接复制的完整文件：

```ts
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
```

这里的 obliterate 受到随机测试 Prefix 的显式保护，只清理本测试创建的键。不得删除 Prefix 检查，也不得把这段清理代码用于开发或生产队列。

如果不关闭 QueueEvents 和 TestingModule，Worker 的阻塞连接会让测试进程无法退出。

不要只导入裸 ConfigModule。否则 queueConfig 不会注册，TaskQueueModule 中的 getOrThrow('queue') 会失败。

这个测试必须连接本地或专用测试 Redis，不能加载生产 Redis 凭据。唯一 Prefix 只能防止键名冲突，不能把生产 Redis 自动变成测试环境。

不要把 ioredis-mock 当作最终验收。BullMQ 依赖 Lua、Streams 和阻塞命令，模拟 Redis 通常不完整。

### 手工验证

```powershell
docker compose up -d redis
$env:RUN_QUEUE_INTEGRATION = 'true'
try {
  vp run --filter server test
} finally {
  Remove-Item Env:RUN_QUEUE_INTEGRATION -ErrorAction SilentlyContinue
}
vp run --filter server build
```

未显式设置 RUN_QUEUE_INTEGRATION 时，普通 `vp run --filter server test` 和 `vp run ready` 会跳过这一个真实 Redis 测试，但仍会执行其他单元测试。

如需查看键，使用 SCAN，不要使用 KEYS：

```powershell
$queueRedisPassword = Read-Host '请输入本地 Redis 密码'
docker compose exec -e REDISCLI_AUTH=$queueRedisPassword redis redis-cli -n 1 --scan --pattern 'bubbles:development:queue:server-tasks:*'
Remove-Variable queueRedisPassword
```

---

## 19. 第 14 步：以后新业务任务怎么接入

每增加一种任务，都按固定顺序操作。

### 19.1 增加任务名

```ts
export const TASK_JOB_NAMES = {
  QUEUE_SMOKE: 'system.queue-smoke.v1',
  SOME_FUTURE_TASK: 'some-domain.some-action.v1',
} as const
```

不要直接复制这个占位任务名到生产代码，应换成真实领域和动作。

### 19.2 增加 Zod Schema

```ts
export const SomeFutureTaskPayloadSchema = z.object({
  resourceId: z.string().uuid(),
  requestedBy: z.string().uuid(),
})
```

### 19.3 加入 TaskPayloadMap 和 Schema Map

```ts
export interface TaskPayloadMap {
  [TASK_JOB_NAMES.QUEUE_SMOKE]: z.infer<typeof QueueSmokePayloadSchema>
  [TASK_JOB_NAMES.SOME_FUTURE_TASK]: z.infer<typeof SomeFutureTaskPayloadSchema>
}

export const TASK_PAYLOAD_SCHEMAS = {
  [TASK_JOB_NAMES.QUEUE_SMOKE]: QueueSmokePayloadSchema,
  [TASK_JOB_NAMES.SOME_FUTURE_TASK]: SomeFutureTaskPayloadSchema,
} satisfies Record<TaskName, z.ZodType>
```

### 19.4 业务模块导入 TaskQueueModule

```ts
@Module({
  imports: [TaskQueueModule],
  providers: [SomeBusinessService],
})
export class SomeBusinessModule {}
```

### 19.5 业务 Service 只负责投递

```ts
constructor(
  private readonly taskQueue: TaskQueueService,
) {}

async startFutureTask(
  resourceId: string,
  userId: string,
) {
  return this.taskQueue.enqueue(
    TASK_JOB_NAMES.SOME_FUTURE_TASK,
    {
      resourceId,
      requestedBy: userId,
    },
    {
      jobId: 'some-future-task-' + resourceId,
    },
  )
}
```

### 19.6 在唯一 Processor 中增加分发

第一版可在 switch 中增加分支，并把真实逻辑委托给单独的 Handler Service。

```ts
case TASK_JOB_NAMES.SOME_FUTURE_TASK: {
  const parsed = SomeFutureTaskPayloadSchema.safeParse(
    job.data,
  )

  if (!parsed.success) {
    throw new UnrecoverableError(
      'Invalid payload for ' + job.name,
    )
  }

  return this.someFutureTaskHandler.handle(parsed.data)
}
```

同时从 contracts 文件导入 SomeFutureTaskPayloadSchema；UnrecoverableError 已在公共 Processor 中导入。不要把未经校验的 job.data 直接传给 Handler。

Processor 负责：

- 路由
- Payload 运行时校验
- 公共日志
- 决定永久错误还是可重试错误

Handler 负责：

- 读取最新数据库状态
- 幂等判断
- 执行真实业务
- 保存结果

### 19.7 为任务补测试

每个真实任务至少测试：

- 首次执行成功
- 临时失败会重试
- 永久错误不重试
- 同一任务重复执行仍安全
- 已完成状态重复执行会幂等返回
- 日志不泄露敏感 Payload

---

## 20. 生产环境必须知道的边界

### 20.1 数据库与 Redis 不是一个事务

以下风险真实存在：

```text
PostgreSQL 提交成功
  ↓
进程在 queue.add 前崩溃
  ↓
数据库有记录，但任务没有进入 Redis
```

第一版基础队列先接受这个边界。

以后某类任务如果“绝对不能漏”，应使用 Transactional Outbox：

```text
同一个数据库事务
  ├── 写业务数据
  └── 写 outbox 事件

独立发布器
  └── 把 outbox 可靠投递到 BullMQ
```

不要把当前方案描述成恰好一次或强一致。

### 20.2 Redis 内存策略

BullMQ 使用的 Redis 必须采用：

```text
maxmemory-policy noeviction
```

当前 Redis 默认策略通常就是 noeviction，但生产部署必须显式检查：

```text
CONFIG GET maxmemory-policy
```

如果 Redis 在内存紧张时自动淘汰 BullMQ 键，队列状态可能损坏。

### 20.3 持久化

当前 Docker Redis 已开启 AOF，这是正确基础。生产环境还要考虑：

- AOF 策略
- 磁盘容量
- 备份
- 故障恢复演练
- Redis 高可用

### 20.4 API 与 Worker 同进程

第一版同进程是合理的，部署简单。

出现以下情况时再拆：

- Worker 抢占 API CPU 或内存。
- API 和 Worker 需要不同副本数。
- Job 执行时间很长。
- 需要 API 快速失败、Worker 持续重连的独立 Redis 策略。
- 需要独立发布和故障隔离。

拆分后 TaskQueueService 的业务调用方式不应变化。

### 20.5 CPU 密集任务

CPU 密集任务会阻塞 Node.js 事件循环，Worker 可能无法及时续锁，导致 Job 被判定 stalled 并重复执行。

这类任务应使用：

- 独立 Worker 进程
- BullMQ 沙箱处理器
- Worker Thread
- 专门的计算服务

### 20.6 监控

第一版至少记录：

- Job completed
- Job failed
- Worker error
- jobId
- jobName
- attemptsMade

后续生产监控应增加：

- waiting 数量
- active 数量
- failed 数量
- stalled 次数
- 最老等待任务时长
- 单任务耗时分布

Bull Board 可以以后作为受保护的内部管理页面接入，本次不做。

---

## 21. 常见故障排查

| 现象                       | 常见原因                                                   | 处理方向                                        |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| 投递成功但没有消费         | TaskQueueModule 未导入、Worker 开关关闭或 Processor 未注册 | 检查 AppModule、QUEUE_WORKER_ENABLED 和启动日志 |
| 任务失败却显示 completed   | Worker catch 后返回了错误对象                              | 让异常继续抛出                                  |
| 同一任务执行两次           | 至少一次语义，处理器缺少幂等                               | 增加数据库唯一约束或状态条件                    |
| 未知任务不断重试           | 未使用 UnrecoverableError                                  | 把未知协议视为永久错误                          |
| Redis 内存持续增长         | 未配置保留上限或 Payload 太大                              | 检查 removeOnComplete、removeOnFail 和 Payload  |
| Session 键和队列键混在一起 | DB 或 Prefix 配错                                          | 本地 Session DB 0、Queue DB 1                   |
| 测试执行完不退出           | QueueEvents 或 TestingModule 未关闭                        | 在 afterAll 关闭资源                            |
| Redis Cluster 报 DB 错误   | Cluster 只能使用 DB 0                                      | 改为 DB 0 和独立 Prefix                         |
| 自定义 jobId 报错          | jobId 含冒号                                               | 改用连字符                                      |
| BullMQ 键结构异常          | 使用了 ioredis keyPrefix                                   | 删除 keyPrefix，使用 BullMQ prefix              |
| Worker 出现重试配置警告    | 共享配置显式设置 maxRetriesPerRequest: 1                   | 第一版共享配置中省略该项                        |
| HTTP 一直等业务结果        | 把入队完成误解为执行完成                                   | HTTP 返回 202 和 jobId                          |
| Job 查不到                 | 完成保留策略太短，或测试 Prefix 不一致                     | 检查保留参数和 Prefix                           |

---

## 22. 最终验收顺序

按下面顺序执行，某一步失败就先停下来修正：

```powershell
docker compose up -d redis
vp install
vp check
vp run --filter server test
$env:RUN_QUEUE_INTEGRATION = 'true'
try {
  vp run --filter server test
} finally {
  Remove-Item Env:RUN_QUEUE_INTEGRATION -ErrorAction SilentlyContinue
}
vp run --filter server build
vp run ready
```

第一次 `vp run --filter server test` 验证普通测试，并确认真实 Redis 测试默认跳过；设置 RUN_QUEUE_INTEGRATION 后的第二次测试才验证真实 Redis 链路。finally 会清理环境开关，确保后面的 `vp run ready` 恢复默认行为。

### 验收清单

- [ ] 使用 @nestjs/bullmq，不是 @nestjs/bull。
- [ ] @nestjs/bullmq 和 bullmq 已加入 workspace catalog。
- [ ] Session Redis DB 0，开发队列 DB 1。
- [ ] 没有复用 @nestjs-modules/ioredis 创建的 Session Redis Client。
- [ ] 没有复制 commandTimeout 和 enableOfflineQueue 到 BullMQ。
- [ ] 共享连接没有显式设置 maxRetriesPerRequest: 1。
- [ ] 队列名和任务名集中定义。
- [ ] 业务模块只调用 TaskQueueService。
- [ ] Payload 同时有 TypeScript 类型和 Zod 校验。
- [ ] 默认重试、指数退避和保留上限已生效。
- [ ] 每个进程对一个物理队列只注册一种能识别全部任务名的公共 WorkerHost。
- [ ] 未知任务名和非法 Payload 不会无意义重试。
- [ ] Worker 不吞异常。
- [ ] Worker 日志不打印完整 Payload。
- [ ] QUEUE_WORKER_ENABLED=false 时仍可投递，但当前进程不消费。
- [ ] app.enableShutdownHooks() 已开启。
- [ ] 单元测试通过。
- [ ] 真实 Redis 完成投递、消费和完成全链路。
- [ ] vp run ready 通过。
- [ ] 没有实现任何真实业务任务。
- [ ] 上传清理仅存在于附加方案文档，没有实现业务代码。

---

## 附录 A：未来上传清理如何接入

详细方案已经拆分到独立文件：[上传清理.md](./上传清理.md)。该文件只说明未来如何复用公共队列，不属于当前实施内容。

以后可能增加：

```text
upload.multipart-expire.v1
upload.session-reconcile.v1
```

Payload 只传上传会话 ID：

```json
{
  "uploadSessionId": "..."
}
```

未来 Handler 应遵守：

1. 根据 uploadSessionId 重新读取数据库。
2. 校验会话当前状态和过期时间。
3. 通过状态条件更新或租约领取处理权。
4. 已完成、已取消或已过期时幂等返回。
5. 不相信 Payload 里的 Bucket、Object Key 或 MinIO UploadId。
6. 从数据库读取真实存储信息。
7. 对象存储操作成功后再更新最终状态。
8. 能安全应对同一 Job 重复执行。

要自动周期性扫描过期上传时，还需要另外选择调度方式，例如 NestJS Schedule 或 BullMQ Job Scheduler。本次不要提前安装调度依赖，也不要实现上传清理。

---

## 附录 B：本次建议的实施边界

本轮真正执行时，只做：

```text
公共配置
公共投递
公共消费
冒烟验证
```

不要顺手加入：

```text
上传清理
任务管理后台
任务进度接口
定时扫描
Outbox
邮件或通知业务
```

先让公共队列稳定跑通，再按真实业务逐个接任务，后端结构会更清楚，也更容易定位问题。
