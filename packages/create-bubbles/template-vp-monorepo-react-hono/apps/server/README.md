# Server

Hono 后端采用两个独立进程：HTTP API 负责接收请求与写入队列，BullMQ Worker 负责消费任务。数据库、Redis 和队列连接均按需创建，导入 `app.ts` 不会连接外部服务。

## 分层

```text
src/
├─ app.ts                         # Hono 应用、middleware、路由与错误处理
├─ index.ts                       # HTTP 进程入口
├─ worker.ts                      # BullMQ Worker 进程入口
├─ config/                        # Zod 环境变量校验
├─ common/                        # 错误、响应、日志
├─ infrastructure/
│  ├─ database/                   # pg Pool、Drizzle 与 schema
│  ├─ redis/                      # 普通 Redis 客户端与连接参数
│  └─ queue/                      # BullMQ 连接工厂
├─ modules/
│  ├─ health/                     # live / ready 健康检查
│  └─ jobs/                       # 示例任务的 route/service/repository/worker
└─ runtime/                       # 优雅关闭工具
```

## 常用命令

```powershell
# Node API / Worker（默认）
vp run --filter server dev:node
vp run --filter server dev:worker:node

# Bun API / Worker
vp run --filter server dev:bun
vp run --filter server dev:worker:bun

vp run --filter server build
vp run --filter server test
vp run --filter server db:generate
vp run --filter server db:migrate
vp run --filter server db:studio
```

生产构建同样通过 Vite+ 启动：

```powershell
vp run --filter server start:node
vp run --filter server start:bun
vp run --filter server start:worker:node
vp run --filter server start:worker:bun
```

Node API 使用 `@hono/node-server`，Bun API 使用原生 `Bun.serve`，二者共用同一个 `app.ts`。Bun 命令使用 `--no-env-file`，统一交给 `dotenv/config` 加载 `.env`，避免两个运行时读取不同的环境文件。

## 接口

- `GET /health/live`: 进程存活检查，不访问外部依赖
- `GET /health/ready`: 检查 PostgreSQL 与 Redis
- `POST /v1/jobs/demo`: 写入 `job_runs` 并投递 BullMQ 示例任务
- `GET /v1/jobs/:id`: 查询任务执行状态
- 上述路由也同时挂载在 `/api/*`，可兼容没有 rewrite 的生产部署

创建示例任务的请求体：

```json
{
  "payload": {
    "message": "hello"
  }
}
```

Redis 必须使用 `noeviction` 策略，HTTP Queue 与阻塞式 Worker 使用不同连接；Worker 连接的 `maxRetriesPerRequest` 固定为 `null`。

BullMQ、ioredis 和 `pg` 主要以 Node 为生产目标，因此 Worker 默认推荐使用 Node。Bun Worker 可以用于开发与兼容性验证，但生产启用前应测试任务重试、延迟任务、锁续期、stalled recovery 和优雅关闭。

示例 jobs 模块通过固定 `jobId` 和失败补偿降低重复与悬挂风险，但 PostgreSQL 写入和 Redis 入队仍不是同一个原子事务。对支付、通知等关键任务，应把创建任务改为 transactional outbox，并让独立 dispatcher 将 outbox 可靠投递到 BullMQ；具体业务处理器也必须保持幂等。
