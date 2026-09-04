# NestJS 中转 MinIO 的 10 MiB 大文件分片上传教程

> 适用目录：`packages/create-bubbles/template-vp-monorepo-react-nestjs`
>
> 适用技术栈：NestJS 11、Fastify、Drizzle、PostgreSQL、MinIO、React。
>
> 本文面向以前端开发为主、刚开始写 NestJS 的开发者。请严格按顺序操作，不要跳过数据库迁移、原始流解析和字节数校验。

## 先看最终方案

本教程实现的是“后端中转”，不是“浏览器直传 MinIO”：

```text
浏览器
  │
  │ 1. JSON：初始化、查询、完成、取消
  │ 2. application/octet-stream：每次发送一个 10 MiB 分片
  ▼
NestJS + Fastify
  │
  │ 鉴权、会话归属校验、分片编号校验、真实字节数校验
  │ 不落临时文件，不把整个分片转成 Buffer
  ▼
MinIO S3 Multipart Upload
  │
  ▼
一个完整的私有对象
```

这意味着：

- 浏览器永远只请求 NestJS，不请求 MinIO。
- MinIO 可以使用 Docker 内部地址 `http://minio:9000`，前提是 NestJS 也在同一个 Compose 网络中。
- NestJS 在 Windows 宿主机运行时，应使用 `http://127.0.0.1:9000`，不能使用 `http://minio:9000`。
- 不需要 MinIO 公网域名、MinIO CORS、预签名 URL、`@aws-sdk/s3-request-presigner`。如果浏览器与 NestJS API 跨域，仍然要配置 **NestJS/API 网关自己的 CORS**；这里只是不需要配置 MinIO CORS。
- 不需要 `@fastify/multipart`，因为分片请求不是 HTTP `multipart/form-data`。
- 每上传 10 MiB，后端会同时承担约 10 MiB 的流入和 10 MiB 的流出。流式中转解决的是内存占用，不会消除后端带宽消耗。

### 固定协议

```ts
export const UPLOAD_PART_SIZE = 10 * 1024 * 1024 // 10 MiB = 10,485,760 字节
export const UPLOAD_MAX_PARTS = 10_000
export const UPLOAD_MAX_FILE_SIZE = 90 * 1024 * 1024 * 1024 // 90 GiB
```

必须遵守以下规则：

1. `partNumber` 从 `1` 开始，不是从 `0` 开始。
2. 除最后一片外，每片必须正好是 `10,485,760` 字节。
3. 最后一片必须是 `1` 到 `10,485,760` 字节。
4. 0 字节文件不走本教程的 Multipart 流程，直接拒绝。
5. MinIO/S3 最多允许 10,000 片。10 MiB 分片的理论上限约 97.66 GiB，本模板主动限制为 90 GiB。
6. 前端默认同时上传 3 片，最多建议 5 片；同一片总共最多尝试 3 次，也就是首次失败后最多再重试 2 次。
7. 同一个 `partNumber` 重新上传会覆盖旧分片，因此分片重试是幂等的。
8. 最终合并时，由后端调用 MinIO `ListParts` 获取真实分片，不能直接信任前端提交的 ETag 数组。

### API 约定

当前模板的浏览器请求统一带 `/api` 前缀，Vite 或 Nginx 去掉 `/api` 后，NestJS Controller 才会收到 `/uploads/multipart`。前端写 URL 时看“浏览器地址”，后端写 Controller 时看“NestJS 路由”。

| 方法     | 浏览器地址                                                  | NestJS 路由                                             | 请求体     | 作用                               |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------- | ---------- | ---------------------------------- |
| `POST`   | `/api/uploads/multipart`                                    | `/uploads/multipart`                                    | JSON       | 初始化上传会话                     |
| `GET`    | `/api/uploads/multipart/:uploadSessionId`                   | `/uploads/multipart/:uploadSessionId`                   | 无         | 查询状态和已上传分片，用于断点续传 |
| `PUT`    | `/api/uploads/multipart/:uploadSessionId/parts/:partNumber` | `/uploads/multipart/:uploadSessionId/parts/:partNumber` | 原始二进制 | 上传一个分片                       |
| `POST`   | `/api/uploads/multipart/:uploadSessionId/complete`          | `/uploads/multipart/:uploadSessionId/complete`          | 无         | 校验并合并全部分片                 |
| `DELETE` | `/api/uploads/multipart/:uploadSessionId`                   | `/uploads/multipart/:uploadSessionId`                   | 无         | 取消上传并释放 MinIO 分片          |

浏览器只拿到业务字段 `uploadSessionId`。MinIO 自己的 `UploadId` 只保存在 PostgreSQL 中，绝不能返回前端。

### 状态流

```text
uploading ──完成请求──> completing ──MinIO 合并成功──> completed
    │
    ├──取消请求──> aborting ──MinIO 清理成功──> aborted
    │
    └──过期清理──────────────────────────────> expired
```

`completed` 是终态，取消接口不能删除已经完成的最终对象。`aborted` 和 `expired` 也不能继续上传分片。

## 实施前检查

### 本步目标

确认当前模板的端口、基础服务和开发约束，避免代码正确但环境不通。

### 文件位置

- `docker-compose.yml`
- `apps/server/.env`
- `apps/server/.env.development.local`
- `apps/web/.env.dev`
- `apps/server/src/common/adapters/fastify.adapter.ts`
- `apps/server/src/database/schema.ts`
- `apps/web/src/utils/request/index.ts`

### 必要说明

当前模板有三个容易踩坑的现状：

1. `apps/server/.env` 当前端口是 `13000`。
2. `apps/web/.env.dev` 当前代理目标是 `http://localhost:10000`。联调前应把它改成 `http://localhost:13000`，或者让 Server 改为 10000，两边必须一致。
3. `apps/web/src/utils/request/index.ts` 的封装默认按“有 `code/data` 外壳”解析，但 Server 成功响应是直接对象。本文的上传控制接口会使用 `isWrapped: false`。

`.spaces/server/todo.md` 是历史规划，其中部分状态已经落后于当前源码。写代码时应以 `apps/server/src` 的实际内容为准。

### 验证

在模板根目录执行：

```powershell
docker compose config
pnpm --filter server build
```

预期结果：

- Compose 配置可以正常解析。
- Server 在增加上传功能前可以构建；如果这里已经失败，应先记录现有错误，不要把它误判成上传代码造成的。

### 常见错误

- 前端一直报网络错误，却只检查上传代码，没有检查 10000/13000 端口不一致。
- 把 MinIO 控制台端口 9001 当成 S3 API 端口。S3 API 是 9000。
- 使用 `.spaces/server/todo.md` 覆盖当前源码事实。

---

## 第 1 步：准备本地 MinIO 和私有 Bucket

### 本步目标

启动 MinIO，并自动创建一个名为 `uploads` 的私有 Bucket。NestJS 只连接 9000，9001 仅供本地开发查看控制台。

### 文件位置

修改：

```text
docker-compose.yml
```

### 精确修改

将文件替换为下面内容。PostgreSQL、Redis 保留不变，只为 MinIO 增加健康检查和一次性初始化服务：

```yaml
services:
  postgres:
    image: postgres:18-alpine
    container_name: vp-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: postgres
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ml
    ports:
      - '5432:5432'
    volumes:
      - postgres18-data:/var/lib/postgresql

  redis:
    image: redis:8-alpine
    container_name: vp-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ml
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data

  minio:
    image: minio/minio:latest
    container_name: vp-minio
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123456
    command: server /data --console-address ":9001"
    ports:
      - '127.0.0.1:9000:9000'
      - '127.0.0.1:9001:9001'
    volumes:
      - minio-data:/data
  minio-init:
    image: minio/mc:latest
    container_name: vp-minio-init
    depends_on:
      minio:
        condition: service_started
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123456
      MINIO_BUCKET: uploads
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 $$MINIO_ROOT_USER $$MINIO_ROOT_PASSWORD;
      do sleep 1; done;
      mc mb --ignore-existing local/$$MINIO_BUCKET;
      mc anonymous set none local/$$MINIO_BUCKET;
      "
    restart: 'no'

volumes:
  postgres18-data:
  redis-data:
  minio-data:
```

### 代码解释

- `minio` 保存真正的对象数据。
- `minio-init` 使用 MinIO Client 创建 Bucket，执行完成后正常退出。它会循环等待 S3 API 可用，因此不依赖 MinIO 镜像里是否碰巧内置 `curl`。
- `mc anonymous set none` 保证 Bucket 不是匿名公开读写。
- 9000 和 9001 只绑定 `127.0.0.1`，避免本地演示账号和控制台监听整张局域网网卡。
- 本地开发暂时沿用模板已有的 Root 账号。生产环境必须改成最小权限服务账号。
- `latest` 只适合本地演示。模板准备发布时，应把 `minio/minio` 和 `minio/mc` 固定为经过测试的版本或镜像摘要，并让二者版本匹配。

### 文件位置

向下面这个被 Git 忽略的本地文件追加配置，不要覆盖文件里已有的数据库和 Session 配置：

```text
apps/server/.env.development.local
```

追加：

```dotenv
# MinIO / S3，NestJS 在 Windows 宿主机运行时使用 127.0.0.1
STORAGE_ENDPOINT=http://127.0.0.1:9000
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=minio
STORAGE_SECRET_ACCESS_KEY=minio123456
STORAGE_BUCKET=uploads
```

如果将来把 NestJS 也放进同一个 Compose 文件，只有那时才改成：

```dotenv
STORAGE_ENDPOINT=http://minio:9000
```

不要把任何 `STORAGE_ACCESS_KEY_ID` 或 `STORAGE_SECRET_ACCESS_KEY` 写进 `apps/web/.env*`，也不要加 `VITE_` 前缀。

### 验证

```powershell
docker compose up -d postgres redis minio minio-init
docker compose ps
docker compose logs minio-init
```

预期结果：

- `vp-minio` 状态为 running。
- `vp-minio-init` 日志显示 alias 和 Bucket 创建成功，然后容器退出码为 0。
- 浏览器打开 `http://127.0.0.1:9001`，使用本地账号登录后能看到私有 Bucket `uploads`。

### 常见错误

- NestJS 在宿主机运行，却填写 `http://minio:9000`：Windows 无法解析 Compose 服务名。
- 填写 `http://127.0.0.1:9001`：9001 是控制台，不是 S3 API。
- Bucket 名与 `STORAGE_BUCKET` 不一致：初始化 Multipart 会返回 `NoSuchBucket`。
- 生产环境继续暴露 9000/9001 到公网，或继续使用 Root 账号。
- 某个 MinIO 镜像不包含 `curl`，导致健康检查失败。此时先用 `docker compose logs minio` 确认服务已启动，再把健康检查改成该固定镜像实际支持的探针；不要直接删除生产健康检查。

---

## 第 2 步：安装 S3 SDK

### 本步目标

使用 AWS SDK v3 的底层 Multipart 命令连接 MinIO。

### 文件位置

修改：

```text
pnpm-workspace.yaml
apps/server/package.json
```

### 精确修改

在根目录 `pnpm-workspace.yaml` 的 `catalog:` 下增加：

```yaml
'@aws-sdk/client-s3': ^3.910.0
```

在 `apps/server/package.json` 的 `dependencies` 中增加：

```json
"@aws-sdk/client-s3": "catalog:"
```

然后在模板根目录执行：

```powershell
pnpm install
```

### 代码解释

本文只需要：

- `CreateMultipartUploadCommand`
- `UploadPartCommand`
- `ListPartsCommand`
- `CompleteMultipartUploadCommand`
- `AbortMultipartUploadCommand`
- `HeadBucketCommand`
- `HeadObjectCommand`

不要安装：

- `@aws-sdk/s3-request-presigner`：本方案不生成浏览器直传签名。
- `@aws-sdk/lib-storage`：它会再次自动切片，和我们自己的浏览器断点续传协议冲突。
- `@fastify/multipart`：分片请求体是原始二进制，不是表单。

不要从 `^3.0.0` 这种过宽下限开始。这里给出一个明确的 3.x 最低版本，实际安装结果由 `pnpm-lock.yaml` 精确锁定；模板升级 SDK 后必须重新跑完整上传测试，并提交新的 Lockfile。

### 验证

```powershell
pnpm --filter server exec node -e "import('@aws-sdk/client-s3').then(() => console.log('s3 sdk ok'))"
```

预期输出：

```text
s3 sdk ok
```

### 常见错误

- 只改 `apps/server/package.json`，忘记根 Catalog，导致模板依赖风格不一致。
- 同时使用 `@aws-sdk/lib-storage`，结果浏览器切一次、后端 SDK 又切一次。
- 安装 presigner 后误以为后端中转也需要 MinIO 公网地址。

---

## 第 3 步：增加 Storage 配置

### 本步目标

集中读取和校验 MinIO 连接配置，并固定 24 小时会话有效期。10 MiB 和 90 GiB 业务规则只在第 4 步的 `upload.constants.ts` 中定义，避免出现两个来源。

### 文件位置

新建：

```text
apps/server/src/config/storage.config.ts
```

### 完整代码

```ts
import { registerAs } from '@nestjs/config'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

function readRequired(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

function readEndpoint(): string {
  const value = readRequired('STORAGE_ENDPOINT')
  const url = new URL(value)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('STORAGE_ENDPOINT must use http or https')
  }

  return url.toString().replace(/\/$/, '')
}

export default registerAs('storage', () => ({
  endpoint: readEndpoint(),
  region: process.env.STORAGE_REGION?.trim() || 'us-east-1',
  accessKeyId: readRequired('STORAGE_ACCESS_KEY_ID'),
  secretAccessKey: readRequired('STORAGE_SECRET_ACCESS_KEY'),
  bucket: readRequired('STORAGE_BUCKET'),
  forcePathStyle: true,
  sessionTtlMs: SESSION_TTL_MS,
}))
```

### 文件位置

修改：

```text
apps/server/src/config/index.ts
```

将其替换为：

```ts
export { default as appConfig } from './app.config'
export { default as databaseConfig } from './database.config'
export { default as llmConfig } from './llm.config'
export { default as redisConfig } from './redis.config'
export { default as sessionConfig } from './session.config'
export { default as storageConfig } from './storage.config'
```

### 文件位置

修改：

```text
apps/server/src/app.module.ts
```

这一文件稍后还要导入 `UploadModule`。现在先把顶部配置导入改成：

```ts
import {
  appConfig,
  databaseConfig,
  llmConfig,
  redisConfig,
  sessionConfig,
  storageConfig,
} from '@/config'
```

再把 `ConfigModule.forRoot` 中的 `load` 改成：

```ts
load: [appConfig, databaseConfig, llmConfig, redisConfig, sessionConfig, storageConfig],
```

### 代码解释

- MinIO 兼容 S3，但本地通常必须使用 `forcePathStyle: true`。
- `storage.config.ts` 只负责连接与会话 TTL；分片大小、最大文件和最大分片数统一放在 `upload.constants.ts`。
- 密钥缺失时让应用启动失败，比运行到第一次上传才报错更容易定位。
- 后端中转时 `endpoint` 只需要对 NestJS 可达，不需要对浏览器可达。

### 验证

先临时注释本地文件中的 `STORAGE_ENDPOINT`，运行：

```powershell
pnpm --filter server dev
```

预期应用明确提示 `STORAGE_ENDPOINT is required`。恢复变量后重新启动，应不再出现该错误。

### 常见错误

- 在配置里写死真实生产密钥并提交 Git。
- 忘记在 `config/index.ts` 导出，或忘记放进 `ConfigModule.forRoot({ load: [...] })`。
- MinIO 使用 path-style，但 S3Client 没设置 `forcePathStyle: true`。

---

## 第 4 步：增加上传常量和分片计算

### 本步目标

让后端成为分片大小的唯一规则来源。前端传来的分片编号只能用于定位，不能决定这一片应该多大。

### 文件位置

新建：

```text
apps/server/src/modules/upload/upload.constants.ts
```

### 完整代码

```ts
export const UPLOAD_PART_SIZE = 10 * 1024 * 1024
export const UPLOAD_MAX_PARTS = 10_000
export const UPLOAD_MAX_FILE_SIZE = 90 * 1024 * 1024 * 1024

export function calculateTotalParts(fileSize: number): number {
  return Math.ceil(fileSize / UPLOAD_PART_SIZE)
}

export function calculateExpectedPartSize(
  fileSize: number,
  totalParts: number,
  partNumber: number,
): number {
  if (partNumber < 1 || partNumber > totalParts) {
    throw new RangeError('partNumber is outside the upload range')
  }

  if (partNumber < totalParts) {
    return UPLOAD_PART_SIZE
  }

  return fileSize - (totalParts - 1) * UPLOAD_PART_SIZE
}
```

### 代码解释

以 25 MiB 文件为例：

```text
totalParts = 3
第 1 片 = 10 MiB
第 2 片 = 10 MiB
第 3 片 = 5 MiB
```

最后一片大小由数据库中的 `fileSize` 计算，不能信任浏览器传一个 `chunkSize`。

### 验证

后面会增加单元测试。现在可以先人工确认：

```ts
calculateTotalParts(25 * 1024 * 1024) === 3
calculateExpectedPartSize(25 * 1024 * 1024, 3, 3) === 5 * 1024 * 1024
```

### 常见错误

- 前端编号从 0 开始，后端编号从 1 开始，导致第一片覆盖或完成顺序错误。
- 使用 `Math.floor` 计算总片数，最后不足 10 MiB 的部分丢失。
- 接受任意小于 10 MiB 的中间片。S3 要求除最后一片外至少 5 MiB，而本协议进一步固定为正好 10 MiB，便于校验和恢复。

---

## 第 5 步：建立上传会话表

### 本步目标

PostgreSQL 只保存“上传会话和状态”，分片本身保存在 MinIO。已上传哪些片以 MinIO `ListParts` 为真实依据，不单独建立分片表。

### 文件位置

修改：

```text
apps/server/src/database/schema.ts
```

### 完整代码

将当前文件替换为：

```ts
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const userStatusEnum = pgEnum('user_status', ['active', 'locked', 'disabled'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  account: varchar('account', { length: 32 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  status: userStatusEnum('status').default('active').notNull(),
  createdAt: timestamp('create_at').defaultNow().notNull(),
  updatedAt: timestamp('update_at', { withTimezone: true }).defaultNow().notNull(),
})

export const uploadStatusEnum = pgEnum('upload_status', [
  'uploading',
  'completing',
  'completed',
  'aborting',
  'aborted',
  'expired',
])

export const uploadSessions = pgTable(
  'upload_sessions',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientUploadId: uuid('client_upload_id').notNull(),
    bucket: varchar('bucket', { length: 63 }).notNull(),
    objectKey: varchar('object_key', { length: 1024 }).notNull(),
    storageUploadId: text('storage_upload_id').notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 255 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    partSize: integer('part_size').notNull(),
    totalParts: integer('total_parts').notNull(),
    status: uploadStatusEnum('status').default('uploading').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    objectEtag: text('object_etag'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('upload_sessions_owner_client_uq').on(table.ownerId, table.clientUploadId),
    uniqueIndex('upload_sessions_bucket_key_uq').on(table.bucket, table.objectKey),
    index('upload_sessions_owner_status_expires_idx').on(
      table.ownerId,
      table.status,
      table.expiresAt,
    ),
    index('upload_sessions_status_expires_idx').on(table.status, table.expiresAt),
    index('upload_sessions_status_updated_idx').on(table.status, table.updatedAt),
  ],
)
```

### 字段解释

- `id`：对前端公开的业务上传会话 ID。
- `clientUploadId`：前端在初始化前生成的 UUID，用于初始化幂等。
- `storageUploadId`：MinIO 返回的 Multipart UploadId，只能留在后端。
- `ownerId`：当前登录用户。后续所有查询都必须同时带 `id + ownerId`。
- `objectKey`：后端生成，不能直接使用客户端文件名。
- `fileSize/partSize/totalParts`：后端校验每片大小的依据。
- `objectEtag`：完成后保存 MinIO 返回值。Multipart ETag 不是整个文件的 MD5。

`ownerId` 使用 `onDelete: 'restrict'` 是有意的：如果直接级联删除上传会话，会先丢掉 MinIO `UploadId/objectKey`，未完成分片和已完成对象都可能变成孤儿。删除用户前应先由业务流程取消未完成上传、处理最终对象，再删除用户；也可以采用软删除。

`ownerId + status + expiresAt` 服务于某个用户的会话查询；`status + expiresAt` 和 `status + updatedAt` 服务于第 18 步的全局清理任务。全局扫描不能只依赖以 `ownerId` 开头的索引。

`ownerId + clientUploadId` 唯一约束解决下面这个场景：

```text
MinIO 初始化成功
  ↓
数据库写入成功
  ↓
响应返回前断网
  ↓
前端使用同一个 clientUploadId 重试
```

重试时后端返回原会话，而不是再制造一个孤儿 Multipart。

### 文件位置

修改：

```text
apps/server/.gitignore
```

删除文件末尾这条规则：

```gitignore
drizzle
```

保留 `# Drizzle` 注释没有问题。迁移文件属于项目源码，必须提交到模板中。

### 生成迁移

在模板根目录执行：

```powershell
pnpm --filter server db:generate
pnpm --filter server db:migrate
```

不要手写迁移 SQL，也不要只在本地执行 `db:push` 后就结束。模板需要可重复执行、可提交的迁移历史。

### 验证

```powershell
pnpm --filter server db:studio
```

预期在 Drizzle Studio 中看到 `upload_sessions` 表和 `upload_status` 枚举，并看到两个唯一索引。

再执行：

```powershell
git status --short apps/server/drizzle apps/server/src/database/schema.ts
```

预期迁移文件出现在 Git 状态中，而不是被 `.gitignore` 隐藏。

### 常见错误

- 所有接口只按 `uploadSessionId` 查询，没有带 `ownerId`，造成越权读取和上传。
- 把每片二进制或 ETag 当成唯一事实存数据库。可能出现“MinIO 已成功，数据库记录失败”，所以最终仍要查询 MinIO。
- 使用客户端原始文件名作为 Key，导致路径穿越、重名覆盖或暴露用户信息。
- 生成迁移后忘记移除 `drizzle` 忽略规则。

---

## 第 6 步：让 Fastify 接收原始二进制流

### 本步目标

Fastify 默认没有 `application/octet-stream` 解析器，而且普通请求体限制通常约 1 MiB。这里要把原始 Node.js `Readable` 直接交给 Controller，不能先读成 Buffer。

### 文件位置

修改：

```text
apps/server/src/common/adapters/fastify.adapter.ts
```

### 完整代码

将文件替换为：

```ts
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { randomUUID } from 'node:crypto'

export function createFastifyAdapter() {
  const adapter = new FastifyAdapter({
    genReqId: () => randomUUID(),
    logger: false,
  })

  adapter
    .getInstance()
    .addContentTypeParser('application/octet-stream', (_request, payload, done) => {
      done(null, payload)
    })

  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id)
    done()
  })

  return adapter
}
```

### 代码解释

`payload` 是请求的可读流。`done(null, payload)` 只是把流交给后续代码，没有把 10 MiB 分片读入内存。

示例没有全局设置 `trustProxy: true`。本地直连不需要它；生产如果按客户端 IP 限流，应在确认反向代理拓扑后，只信任明确的代理 IP、CIDR 或固定跳数，并让边缘代理覆盖客户端传入的 `X-Forwarded-*`，不能无条件信任任意来源的转发头。

不要写成：

```ts
parseAs: 'buffer'
```

也不要在 Controller 中调用：

```ts
await request.body.arrayBuffer()
await file.toBuffer()
```

自定义流解析器不会替你完成可靠的“真实字节数”限制，所以后面还必须增加计数 Transform。只设置 Fastify `bodyLimit` 不够。

### 验证

完成 Controller 接线后执行：

```powershell
curl.exe -i -X PUT http://127.0.0.1:13000/uploads/multipart/not-a-uuid/parts/1 -H "Content-Type: application/octet-stream" --data-binary "test"
```

预期不再收到“没有 application/octet-stream 解析器”的 415。由于路径和鉴权无效，最终应由鉴权或 Zod 返回 401/400，这说明请求已经进入 NestJS。

### 常见错误

- 安装 `@fastify/multipart` 后使用 `request.file()`：那是表单上传，不是本协议。
- 使用 `parseAs: 'buffer'`：并发 100 个分片时，至少可能额外占用约 1 GiB 内存。
- 以为注册原始流后 Fastify 会自动拒绝 10 MiB+1，实际没有做真实流计数。

---

## 第 7 步：实现严格字节数 Transform

### 本步目标

同时校验两层大小：

1. 请求头 `Content-Length` 必须等于后端计算值，用于尽早拒绝。
2. 实际读到的流字节数也必须等于计算值，防止伪造请求头或中途断流。

### 文件位置

新建：

```text
apps/server/src/modules/upload/storage/exact-size.transform.ts
```

### 完整代码

```ts
import { Transform, type TransformCallback } from 'node:stream'

export class ExactSizeError extends Error {
  constructor(
    readonly expectedBytes: number,
    readonly receivedBytes: number,
  ) {
    super(`Expected ${expectedBytes} bytes, received ${receivedBytes}`)
    this.name = ExactSizeError.name
  }
}

export class ExactSizeTransform extends Transform {
  receivedBytes = 0

  constructor(private readonly expectedBytes: number) {
    super()
  }

  override _transform(chunk: unknown, encoding: BufferEncoding, callback: TransformCallback): void {
    const byteLength = Buffer.isBuffer(chunk)
      ? chunk.length
      : Buffer.byteLength(String(chunk), encoding)

    this.receivedBytes += byteLength

    if (this.receivedBytes > this.expectedBytes) {
      callback(new ExactSizeError(this.expectedBytes, this.receivedBytes))
      return
    }

    callback(null, chunk)
  }

  override _flush(callback: TransformCallback): void {
    if (this.receivedBytes !== this.expectedBytes) {
      callback(new ExactSizeError(this.expectedBytes, this.receivedBytes))
      return
    }

    callback()
  }
}

export function findExactSizeError(cause: unknown): ExactSizeError | null {
  let current = cause

  for (let depth = 0; depth < 8; depth += 1) {
    if (current instanceof ExactSizeError) {
      return current
    }

    if (typeof current !== 'object' || current === null || !('cause' in current)) {
      return null
    }

    current = current.cause
  }

  return null
}
```

### 代码解释

- 一旦超过预期大小，立即终止流，不会继续把恶意数据送到 MinIO。
- 流结束时不足预期大小，也会报错。
- `findExactSizeError` 会沿着 `cause` 查找，因为网络 SDK 有时会在外面包一层错误。
- 错误消息只用于服务端诊断，最终给浏览器的是统一的 `UPLOAD.PART_SIZE_MISMATCH`。

### 验证

后面会增加自动化测试，至少覆盖：

- 正好 10 MiB：通过。
- 10 MiB + 1 字节：在超出时立即失败。
- 10 MiB - 1 字节：在流结束时失败。

### 常见错误

- 只检查 `Content-Length`，不检查实际流。
- 为了计算大小先把流读完，失去流式中转意义。
- 后端自动重试已经消费过的 Node.js 流。不可回放流应由前端重新发送对应 Blob。

---

## 第 8 步：定义存储接口并实现 MinIO 适配器

### 本步目标

业务 Service 不直接依赖 AWS SDK。以后即使换成 AWS S3、阿里云 OSS 的 S3 兼容层，Controller 和业务协议也不需要重写。

### 文件位置

新建：

```text
apps/server/src/modules/upload/storage/storage.port.ts
```

### 完整代码

```ts
import type { Readable } from 'node:stream'

export const STORAGE_PORT = Symbol('STORAGE_PORT')

export interface StoragePart {
  partNumber: number
  etag: string
  size: number
}

export interface CreateMultipartInput {
  bucket: string
  objectKey: string
  contentType: string
  metadata: Record<string, string>
}

export interface UploadPartInput {
  bucket: string
  objectKey: string
  storageUploadId: string
  partNumber: number
  body: Readable
  contentLength: number
  abortSignal?: AbortSignal
}

export interface MultipartIdentity {
  bucket: string
  objectKey: string
  storageUploadId: string
}

export interface StorageObject {
  etag: string | null
  contentLength: number | null
  metadata: Record<string, string>
}

export class StorageMultipartNotFoundError extends Error {
  constructor(cause: unknown) {
    super('Multipart upload does not exist', { cause })
    this.name = StorageMultipartNotFoundError.name
  }
}

export interface StoragePort {
  createMultipartUpload(input: CreateMultipartInput): Promise<{ storageUploadId: string }>

  uploadPart(input: UploadPartInput): Promise<{ etag: string }>

  listParts(input: MultipartIdentity): Promise<StoragePart[]>

  completeMultipartUpload(
    input: MultipartIdentity & { parts: readonly StoragePart[] },
  ): Promise<{ etag: string | null }>

  abortMultipartUpload(input: MultipartIdentity): Promise<void>

  headObject(input: { bucket: string; objectKey: string }): Promise<StorageObject | null>
}
```

### 文件位置

新建：

```text
apps/server/src/modules/upload/storage/minio-storage.adapter.ts
```

### 完整代码

```ts
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  StorageMultipartNotFoundError,
  type CreateMultipartInput,
  type MultipartIdentity,
  type StoragePart,
  type StoragePort,
  type UploadPartInput,
} from './storage.port'

function hasErrorName(cause: unknown, expected: string): boolean {
  if (typeof cause !== 'object' || cause === null) {
    return false
  }

  const record = cause as { name?: unknown; Code?: unknown }
  return record.name === expected || record.Code === expected
}

function throwMappedMultipartError(cause: unknown): never {
  if (hasErrorName(cause, 'NoSuchUpload')) {
    throw new StorageMultipartNotFoundError(cause)
  }

  throw cause
}

@Injectable()
export class MinioStorageAdapter implements StoragePort, OnModuleInit, OnModuleDestroy {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('storage.bucket')
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('storage.endpoint'),
      region: config.getOrThrow<string>('storage.region'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('storage.accessKeyId'),
        secretAccessKey: config.getOrThrow<string>('storage.secretAccessKey'),
      },
      forcePathStyle: config.getOrThrow<boolean>('storage.forcePathStyle'),
      // UploadPart 的 Body 是不可回放流，禁止 SDK 在后端自动重放。
      maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  async onModuleInit(): Promise<void> {
    await this.assertBucketAvailable()
  }

  onModuleDestroy(): void {
    this.client.destroy()
  }

  private async assertBucketAvailable(): Promise<void> {
    await this.client.send(
      new HeadBucketCommand({
        Bucket: this.bucket,
      }),
    )
  }

  async createMultipartUpload(input: CreateMultipartInput) {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    )

    if (!response.UploadId) {
      throw new Error('Storage did not return an UploadId')
    }

    return {
      storageUploadId: response.UploadId,
    }
  }

  async uploadPart(input: UploadPartInput) {
    try {
      const response = await this.client.send(
        new UploadPartCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          UploadId: input.storageUploadId,
          PartNumber: input.partNumber,
          Body: input.body,
          ContentLength: input.contentLength,
        }),
        {
          abortSignal: input.abortSignal,
        },
      )

      if (!response.ETag) {
        throw new Error('Storage did not return an ETag')
      }

      return {
        etag: response.ETag,
      }
    } catch (cause: unknown) {
      throwMappedMultipartError(cause)
    }
  }

  async listParts(input: MultipartIdentity): Promise<StoragePart[]> {
    const parts: StoragePart[] = []
    let partNumberMarker: string | undefined

    try {
      for (;;) {
        const response = await this.client.send(
          new ListPartsCommand({
            Bucket: input.bucket,
            Key: input.objectKey,
            UploadId: input.storageUploadId,
            PartNumberMarker: partNumberMarker,
          }),
        )

        for (const part of response.Parts ?? []) {
          if (part.PartNumber === undefined || part.ETag === undefined || part.Size === undefined) {
            throw new Error('Storage returned an incomplete part record')
          }

          parts.push({
            partNumber: part.PartNumber,
            etag: part.ETag,
            size: part.Size,
          })
        }

        if (!response.IsTruncated) {
          break
        }

        const nextMarker = response.NextPartNumberMarker

        if (!nextMarker || nextMarker === partNumberMarker) {
          throw new Error('Storage returned an invalid ListParts cursor')
        }

        partNumberMarker = nextMarker
      }
    } catch (cause: unknown) {
      throwMappedMultipartError(cause)
    }

    return parts.sort((left, right) => left.partNumber - right.partNumber)
  }

  async completeMultipartUpload(input: MultipartIdentity & { parts: readonly StoragePart[] }) {
    try {
      const response = await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          UploadId: input.storageUploadId,
          MultipartUpload: {
            Parts: input.parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
            })),
          },
        }),
      )

      return {
        etag: response.ETag ?? null,
      }
    } catch (cause: unknown) {
      throwMappedMultipartError(cause)
    }
  }

  async abortMultipartUpload(input: MultipartIdentity): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          UploadId: input.storageUploadId,
        }),
      )
    } catch (cause: unknown) {
      if (hasErrorName(cause, 'NoSuchUpload')) {
        return
      }

      throw cause
    }
  }

  async headObject(input: { bucket: string; objectKey: string }) {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
        }),
      )

      return {
        etag: response.ETag ?? null,
        contentLength: response.ContentLength ?? null,
        metadata: response.Metadata ?? {},
      }
    } catch (cause: unknown) {
      if (hasErrorName(cause, 'NoSuchBucket')) {
        throw cause
      }

      if (hasErrorName(cause, 'NoSuchKey')) {
        return null
      }

      if (hasErrorName(cause, 'NotFound')) {
        // 某些 S3 兼容实现会把“对象不存在”和“Bucket 不存在”都表示成 404。
        // 额外探测 Bucket；只有 Bucket 确实可用时，才把这次 404 当成对象不存在。
        await this.assertBucketAvailable()
        return null
      }

      throw cause
    }
  }
}
```

### 代码解释

#### 为什么必须循环 ListParts

MinIO/S3 一次通常最多返回 1000 片，而本协议最多允许 10,000 片。必须使用：

- `PartNumberMarker`
- `NextPartNumberMarker`
- `IsTruncated`

只请求一次会让 1000 片之后的数据“看起来不存在”。

#### 为什么不去掉 ETag 的引号

ETag 是存储服务返回的不透明值。按原样放进 `CompleteMultipartUploadCommand`，不要自行去引号、拼接或当作 MD5。

#### 为什么设置 checksum 选项

对不可回放的 Node 流，SDK 如果为了额外校验尝试预读或重试，会让行为变复杂。`WHEN_REQUIRED` 表示只在协议真正要求时计算或验证。

#### 为什么设置 `maxAttempts: 1`

`UploadPart` 的 Body 是正在到达的请求流，发送一次以后不能倒带。SDK 默认重试可能尝试重新使用已经消费过的流，因此这里关闭 SDK 级自动重试。需要重试时，由浏览器重新切出同一个 Blob，再发一次相同 `partNumber`。

这里的 `maxAttempts: 1` 配在同一个 `S3Client` 上，所以 Create、List、Complete、Abort、Head 也都是单次尝试。这是有意把“请求是否安全重放”的判断放到业务层：初始化由 `clientUploadId` 和生命周期兜底，Complete 由 `completing + HeadObject` 恢复，Abort/过期由清理任务重试。若以后拆成 `partClient` 与 `controlClient`，也不能不加分析就给 Create/Complete 开自动重试。

#### 为什么启动时还要 HeadBucket

`HeadObject` 的 404 在不同 S3 兼容实现中不一定能稳定区分“对象不存在”和“Bucket 不存在”。Adapter 启动时先用 `HeadBucket` 快速失败；运行期间再遇到通用 `NotFound`，也会重新探测 Bucket。这样 Bucket 被删、名称写错或账号没有桶级权限时会明确报错，不会被误判成“完成对象还没出现”。

### 验证

完成 Module 接线后，启动 Server 时不应出现 S3Client 依赖注入错误。真正的 MinIO 连通性会在初始化接口中验证。

### 常见错误

- `ListParts` 只调用一次。
- Complete 前没有按 `partNumber` 升序排序。
- 后端收到不可回放流后自动重试。正确做法是让前端重新发送这一片。
- 把最终 Multipart ETag 当整个文件 MD5，用于去重或完整性证明。
- 把 HeadObject 的所有 HTTP 404 都当成“对象不存在”，从而把 `NoSuchBucket` 配置错误也静默吞掉。通用 `NotFound` 必须再用 HeadBucket 确认 Bucket 可用。

---

## 第 9 步：定义对象 Key、DTO 和业务错误

### 本步目标

后端生成安全对象 Key；Zod 校验 JSON 和路径参数；所有可预期错误遵守当前项目的 `AppException + 错误目录` 规则。

### 文件位置

新建：

```text
apps/server/src/modules/upload/utils/object-key.ts
```

### 完整代码

```ts
export function buildUploadObjectKey(
  ownerId: string,
  uploadSessionId: string,
  now = new Date(),
): string {
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')

  return `users/${ownerId}/${year}/${month}/${uploadSessionId}`
}
```

对象 Key 完全由后端字段组成。原始文件名只存数据库，不进入 Key，因此中文名、重复名、斜杠和特殊字符都不会影响对象路径。

### 文件位置

新建：

```text
apps/server/src/modules/upload/dto/initiate-multipart-upload.dto.ts
```

### 完整代码

```ts
import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const initiateMultipartUploadSchema = z
  .object({
    clientUploadId: z.string().uuid(),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\u0000-\u001F\u007F]/u.test(value), 'fileName 不能包含控制字符'),
    fileSize: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    contentType: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/,
        'contentType 必须是安全的 MIME media type，例如 image/png',
      ),
  })
  .strict()

export class InitiateMultipartUploadDto extends createZodDto(initiateMultipartUploadSchema) {}
```

`contentType` 会进入发往 MinIO 的 HTTP Header，所以不能只检查换行；这里直接限制为常见、安全的 ASCII `type/subtype`。前端拿不到 MIME 时统一发送 `application/octet-stream`。`fileName` 虽然不进入对象 Key，也要拒绝控制字符；以后做下载时不能把它直接拼进 `Content-Disposition`，应使用成熟库或 RFC 5987 编码。

### 文件位置

新建：

```text
apps/server/src/modules/upload/dto/upload-params.dto.ts
```

### 完整代码

```ts
import { UPLOAD_MAX_PARTS } from '@/modules/upload/upload.constants'
import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const uploadSessionParamsSchema = z.object({
  uploadSessionId: z.string().uuid(),
})

export const uploadPartParamsSchema = uploadSessionParamsSchema.extend({
  partNumber: z.coerce.number().int().min(1).max(UPLOAD_MAX_PARTS),
})

export class UploadSessionParamsDto extends createZodDto(uploadSessionParamsSchema) {}

export class UploadPartParamsDto extends createZodDto(uploadPartParamsSchema) {}
```

路径参数原本是字符串，所以 `partNumber` 必须使用 `z.coerce.number()`。否则拿字符串 `"10"` 做数值比较时很容易产生隐蔽错误。

### 文件位置

新建：

```text
apps/server/src/modules/upload/upload.errors.ts
```

### 完整代码

```ts
import type { AppErrorDefinition } from '@/common/exceptions/app.exception'
import { HttpStatus } from '@nestjs/common'

export const UPLOAD_ERRORS = {
  FILE_EMPTY: {
    code: 'UPLOAD.FILE_EMPTY',
    publicMessage: '空文件不能使用分片上传',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  FILE_TOO_LARGE: {
    code: 'UPLOAD.FILE_TOO_LARGE',
    publicMessage: '文件超过允许的最大大小',
    status: HttpStatus.PAYLOAD_TOO_LARGE,
  },
  CLIENT_UPLOAD_ID_CONFLICT: {
    code: 'UPLOAD.CLIENT_UPLOAD_ID_CONFLICT',
    publicMessage: '该客户端上传标识已用于另一个文件',
    status: HttpStatus.CONFLICT,
  },
  SESSION_NOT_FOUND: {
    code: 'UPLOAD.SESSION_NOT_FOUND',
    publicMessage: '上传会话不存在',
    status: HttpStatus.NOT_FOUND,
  },
  INVALID_STATE: {
    code: 'UPLOAD.INVALID_STATE',
    publicMessage: '当前上传状态不允许执行此操作',
    status: HttpStatus.CONFLICT,
  },
  UPLOAD_EXPIRED: {
    code: 'UPLOAD.UPLOAD_EXPIRED',
    publicMessage: '上传会话已过期，请重新开始',
    status: HttpStatus.GONE,
  },
  PART_NUMBER_INVALID: {
    code: 'UPLOAD.PART_NUMBER_INVALID',
    publicMessage: '分片编号超出当前文件范围',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  PART_LENGTH_REQUIRED: {
    code: 'UPLOAD.PART_LENGTH_REQUIRED',
    publicMessage: '分片请求缺少有效的 Content-Length',
    status: HttpStatus.LENGTH_REQUIRED,
  },
  PART_SIZE_MISMATCH: {
    code: 'UPLOAD.PART_SIZE_MISMATCH',
    publicMessage: '分片实际大小与预期不一致',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  UNSUPPORTED_CONTENT_ENCODING: {
    code: 'UPLOAD.UNSUPPORTED_CONTENT_ENCODING',
    publicMessage: '分片请求不支持压缩编码',
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  },
  PARTS_INCOMPLETE: {
    code: 'UPLOAD.PARTS_INCOMPLETE',
    publicMessage: '分片尚未全部上传或大小不正确',
    status: HttpStatus.CONFLICT,
  },
  PARTS_STILL_ACTIVE: {
    code: 'UPLOAD.PARTS_STILL_ACTIVE',
    publicMessage: '仍有分片正在上传，请稍后重试',
    status: HttpStatus.CONFLICT,
  },
  PART_UPLOAD_ABORTED: {
    code: 'UPLOAD.PART_UPLOAD_ABORTED',
    publicMessage: '分片上传已取消',
    status: HttpStatus.REQUEST_TIMEOUT,
  },
  STORAGE_UPLOAD_MISSING: {
    code: 'UPLOAD.STORAGE_UPLOAD_MISSING',
    publicMessage: '存储中的上传会话已失效，请重新开始',
    status: HttpStatus.GONE,
  },
  STORAGE_UNAVAILABLE: {
    code: 'UPLOAD.STORAGE_UNAVAILABLE',
    publicMessage: '文件存储服务暂时不可用，请稍后重试',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
} as const satisfies Record<string, AppErrorDefinition>
```

### 文件位置

修改：

```text
apps/server/test/error-catalog.spec.ts
```

### 完整代码

将文件替换为：

```ts
import { COMMON_ERRORS } from '@/common/error/common.error'
import { AUTH_ERRORS } from '@/modules/auth/auth.errors'
import { UPLOAD_ERRORS } from '@/modules/upload/upload.errors'
import { describe, expect, it } from 'vite-plus/test'

const definitions = [
  ...Object.values(COMMON_ERRORS),
  ...Object.values(AUTH_ERRORS),
  ...Object.values(UPLOAD_ERRORS),
]

describe('error catalog', () => {
  it('uses valid and globally unique error codes', () => {
    const codes = definitions.map((definition) => definition.code)

    expect(new Set(codes).size).toBe(codes.length)

    for (const definition of definitions) {
      expect(definition.code).toMatch(/^[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)+$/)
      expect(definition.code.length).toBeLessThanOrEqual(80)
      expect(definition.status).toBeGreaterThanOrEqual(400)
      expect(definition.status).toBeLessThanOrEqual(599)
      expect(definition.publicMessage.trim()).not.toBe('')
    }
  })

  it('keeps bearerChallenge and HTTP 401 in sync', () => {
    for (const definition of definitions) {
      const hasBearerChallenge =
        'bearerChallenge' in definition && definition.bearerChallenge === true

      expect(hasBearerChallenge).toBe(definition.status === 401)
    }
  })
})
```

### 验证

```powershell
pnpm --filter server test
```

预期 `error catalog` 测试通过。

### 常见错误

- 把 MinIO 原始错误文本直接返回浏览器，泄漏 Bucket、Key、节点地址或内部实现。
- 新增错误后忘记加入错误目录测试。
- 对“不存在”和“不属于当前用户”返回不同结果，导致攻击者枚举别人的会话。
- MIME 类型来自客户端，只能当元数据，不能作为安全判断或病毒扫描结果。

---

## 第 10 步：实现上传 Repository

### 本步目标

封装所有数据库访问，并强制每个查询都带当前登录用户的 `ownerId`。

### 文件位置

新建：

```text
apps/server/src/modules/upload/upload.repository.ts
```

### 完整代码

```ts
import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import { uploadSessions } from '@/database/schema'
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'

export type UploadSession = typeof uploadSessions.$inferSelect
export type CreateUploadSession = typeof uploadSessions.$inferInsert

@Injectable()
export class UploadRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(input: CreateUploadSession): Promise<UploadSession | null> {
    const [session] = await this.db
      .insert(uploadSessions)
      .values(input)
      .onConflictDoNothing({
        target: [uploadSessions.ownerId, uploadSessions.clientUploadId],
      })
      .returning()

    return session ?? null
  }

  async findById(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .select()
      .from(uploadSessions)
      .where(and(eq(uploadSessions.id, uploadSessionId), eq(uploadSessions.ownerId, ownerId)))
      .limit(1)

    return session ?? null
  }

  async findByClientUploadId(
    ownerId: string,
    clientUploadId: string,
  ): Promise<UploadSession | null> {
    const [session] = await this.db
      .select()
      .from(uploadSessions)
      .where(
        and(eq(uploadSessions.ownerId, ownerId), eq(uploadSessions.clientUploadId, clientUploadId)),
      )
      .limit(1)

    return session ?? null
  }

  async claimCompleting(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'completing',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'uploading'),
        ),
      )
      .returning()

    return session ?? null
  }

  async resetCompleting(ownerId: string, uploadSessionId: string): Promise<void> {
    await this.db
      .update(uploadSessions)
      .set({
        status: 'uploading',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'completing'),
        ),
      )
  }

  async markCompleted(
    ownerId: string,
    uploadSessionId: string,
    objectEtag: string | null,
  ): Promise<UploadSession | null> {
    const now = new Date()
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'completed',
        objectEtag,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'completing'),
        ),
      )
      .returning()

    return session ?? null
  }

  async claimAborting(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'aborting',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          inArray(uploadSessions.status, ['uploading', 'aborting', 'expired']),
        ),
      )
      .returning()

    return session ?? null
  }

  async markAborted(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'aborted',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'aborting'),
        ),
      )
      .returning()

    return session ?? null
  }

  async markExpired(ownerId: string, uploadSessionId: string): Promise<UploadSession | null> {
    const [session] = await this.db
      .update(uploadSessions)
      .set({
        status: 'expired',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(uploadSessions.id, uploadSessionId),
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.status, 'uploading'),
        ),
      )
      .returning()

    return session ?? null
  }
}
```

### 代码解释

- `create` 使用唯一约束实现初始化幂等。
- `claimCompleting` 是条件更新：只有一个请求能把 `uploading` 改成 `completing`。
- `claimAborting` 同样避免“完成”和“取消”同时成功。
- 用户 B 即使猜到用户 A 的 UUID，`id + ownerId` 查询仍返回空，统一表现为 404。

### 验证

完成 Service 后，应使用两个账号验证：

1. 账号 A 初始化上传，记录 `uploadSessionId`。
2. 账号 B 使用该 ID 调用查询、分片、完成、取消。
3. 四类请求都应得到 `UPLOAD.SESSION_NOT_FOUND`，不能泄漏会话属于其他人。

### 常见错误

- Repository 提供一个只按 ID 查询的公共方法，后来某个接口忘记补 owner 条件。
- 先查询状态再无条件更新，两个完成请求同时进入。这里使用带旧状态条件的原子更新。
- 取消已经 `completed` 的会话时直接删除最终对象。本文不会这么做。

---

## 第 11 步：实现上传 Service

### 本步目标

完成五个核心流程：

1. 初始化 Multipart，并用 `clientUploadId` 保证幂等。
2. 校验并流式中转单个分片。
3. 从 MinIO 查询真实断点。
4. 校验全部分片后完成合并。
5. 幂等取消并释放未完成分片。

> 重要边界：下面是便于先跑通协议的教学基线，它要求调用方在 Complete/DELETE 前先停止并等待所有 PUT 结束。只靠会话状态无法看见已经开始的在途请求；对公网或多实例部署必须继续完成第 18 步的“活动分片租约”，否则不能宣称 Complete/Abort 已具备生产级竞态安全。

### 文件位置

新建：

```text
apps/server/src/modules/upload/upload.service.ts
```

### 完整代码

```ts
import { AppException } from '@/common/exceptions/app.exception'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import type { InitiateMultipartUploadDto } from './dto/initiate-multipart-upload.dto'
import {
  calculateExpectedPartSize,
  calculateTotalParts,
  UPLOAD_MAX_FILE_SIZE,
  UPLOAD_MAX_PARTS,
  UPLOAD_PART_SIZE,
} from './upload.constants'
import { UPLOAD_ERRORS } from './upload.errors'
import { ExactSizeTransform, findExactSizeError } from './storage/exact-size.transform'
import {
  STORAGE_PORT,
  StorageMultipartNotFoundError,
  type MultipartIdentity,
  type StoragePart,
  type StoragePort,
} from './storage/storage.port'
import { UploadRepository, type UploadSession } from './upload.repository'
import { buildUploadObjectKey } from './utils/object-key'

export interface UploadedPartResponse {
  partNumber: number
  size: number
  etag: string
}

export interface UploadStatusResponse {
  uploadSessionId: string
  fileName: string
  fileSize: number
  contentType: string
  partSize: number
  totalParts: number
  status: UploadSession['status']
  expiresAt: string
  uploadedParts: UploadedPartResponse[]
}

export interface CompletedUploadResponse {
  uploadSessionId: string
  status: 'completed'
  objectKey: string
  etag: string | null
}

interface UploadPartCommandInput {
  ownerId: string
  uploadSessionId: string
  partNumber: number
  contentLength: string | undefined
  contentEncoding: string | undefined
  body: Readable
  abortSignal: AbortSignal
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name)
  private readonly bucket: string
  private readonly sessionTtlMs: number

  constructor(
    private readonly uploadRepository: UploadRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    config: ConfigService,
  ) {
    this.bucket = config.getOrThrow<string>('storage.bucket')
    this.sessionTtlMs = config.getOrThrow<number>('storage.sessionTtlMs')
  }

  async initiate(
    ownerId: string,
    input: InitiateMultipartUploadDto,
  ): Promise<UploadStatusResponse> {
    this.validateNewFile(input.fileSize)

    const existing = await this.uploadRepository.findByClientUploadId(ownerId, input.clientUploadId)

    if (existing) {
      this.assertSameClientFile(existing, input)
      return this.getStatus(ownerId, existing.id)
    }

    const totalParts = calculateTotalParts(input.fileSize)

    if (totalParts > UPLOAD_MAX_PARTS) {
      throw new AppException(UPLOAD_ERRORS.FILE_TOO_LARGE)
    }

    const uploadSessionId = randomUUID()
    const objectKey = buildUploadObjectKey(ownerId, uploadSessionId)
    const storageResult = await this.callStorage(() =>
      this.storage.createMultipartUpload({
        bucket: this.bucket,
        objectKey,
        contentType: input.contentType.trim(),
        metadata: {
          'upload-session-id': uploadSessionId,
          'owner-id': ownerId,
        },
      }),
    )

    const identity: MultipartIdentity = {
      bucket: this.bucket,
      objectKey,
      storageUploadId: storageResult.storageUploadId,
    }

    try {
      const created = await this.uploadRepository.create({
        id: uploadSessionId,
        ownerId,
        clientUploadId: input.clientUploadId,
        bucket: this.bucket,
        objectKey,
        storageUploadId: storageResult.storageUploadId,
        originalName: input.fileName.trim(),
        contentType: input.contentType.trim(),
        fileSize: input.fileSize,
        partSize: UPLOAD_PART_SIZE,
        totalParts,
        status: 'uploading',
        expiresAt: new Date(Date.now() + this.sessionTtlMs),
      })

      if (created) {
        return this.toStatusResponse(created, [])
      }

      const winner = await this.uploadRepository.findByClientUploadId(ownerId, input.clientUploadId)

      await this.safeAbort(identity)

      if (!winner) {
        throw new Error('Upload session conflict winner was not found')
      }

      this.assertSameClientFile(winner, input)
      return this.getStatus(ownerId, winner.id)
    } catch (cause: unknown) {
      await this.safeAbort(identity)
      throw cause
    }
  }

  async getStatus(ownerId: string, uploadSessionId: string): Promise<UploadStatusResponse> {
    let session = await this.requireSession(ownerId, uploadSessionId)

    if (session.status === 'expired') {
      throw new AppException(UPLOAD_ERRORS.UPLOAD_EXPIRED)
    }

    if (session.status === 'uploading') {
      await this.ensureNotExpired(session)
    }

    if (session.status === 'completing') {
      const recovered = await this.recoverCompletedObject(session)

      if (recovered) {
        session = recovered
      }
    }

    if (session.status !== 'uploading' && session.status !== 'completing') {
      return this.toStatusResponse(session, [])
    }

    const parts = await this.callStorage(() =>
      this.storage.listParts(this.toMultipartIdentity(session)),
    )

    return this.toStatusResponse(session, parts)
  }

  async uploadPart(input: UploadPartCommandInput) {
    const session = await this.requireSession(input.ownerId, input.uploadSessionId)

    if (session.status !== 'uploading') {
      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    await this.ensureNotExpired(session)

    if (input.partNumber < 1 || input.partNumber > session.totalParts) {
      throw new AppException(UPLOAD_ERRORS.PART_NUMBER_INVALID)
    }

    if (input.contentEncoding && input.contentEncoding.toLowerCase() !== 'identity') {
      throw new AppException(UPLOAD_ERRORS.UNSUPPORTED_CONTENT_ENCODING)
    }

    const expectedSize = calculateExpectedPartSize(
      session.fileSize,
      session.totalParts,
      input.partNumber,
    )
    const declaredSize = this.parseContentLength(input.contentLength)

    if (declaredSize !== expectedSize) {
      throw new AppException(UPLOAD_ERRORS.PART_SIZE_MISMATCH)
    }

    const exactSizeStream = new ExactSizeTransform(expectedSize)
    const onSourceError = (cause: Error) => exactSizeStream.destroy(cause)
    input.body.once('error', onSourceError)

    try {
      const guardedBody = input.body.pipe(exactSizeStream)
      const result = await this.callStorage(() =>
        this.storage.uploadPart({
          ...this.toMultipartIdentity(session),
          partNumber: input.partNumber,
          body: guardedBody,
          contentLength: expectedSize,
          abortSignal: input.abortSignal,
        }),
      )

      return {
        partNumber: input.partNumber,
        size: expectedSize,
        etag: result.etag,
      }
    } catch (cause: unknown) {
      // MinIO 提前拒绝时，停止继续写入目标 Transform；继续排空剩余请求体，
      // 避免 HTTP 连接因为无人消费请求流而长期停滞。这里不会把整片读进内存。
      input.body.unpipe(exactSizeStream)
      exactSizeStream.destroy()

      if (!input.body.destroyed) {
        input.body.resume()
      }

      throw cause
    } finally {
      input.body.unpipe(exactSizeStream)
      input.body.off('error', onSourceError)

      if (!exactSizeStream.destroyed) {
        exactSizeStream.destroy()
      }
    }
  }

  async complete(ownerId: string, uploadSessionId: string): Promise<CompletedUploadResponse> {
    let session = await this.requireSession(ownerId, uploadSessionId)

    if (session.status === 'completed') {
      return this.toCompletedResponse(session)
    }

    if (session.status === 'completing') {
      const recovered = await this.recoverCompletedObject(session)

      if (recovered) {
        return this.toCompletedResponse(recovered)
      }

      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    if (session.status !== 'uploading') {
      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    await this.ensureNotExpired(session)

    const claimed = await this.uploadRepository.claimCompleting(ownerId, uploadSessionId)

    if (!claimed) {
      session = await this.requireSession(ownerId, uploadSessionId)

      if (session.status === 'completed') {
        return this.toCompletedResponse(session)
      }

      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    let completeWasAttempted = false

    try {
      const parts = await this.callStorage(() =>
        this.storage.listParts(this.toMultipartIdentity(claimed)),
      )

      this.assertCompleteParts(claimed, parts)

      completeWasAttempted = true
      const completed = await this.callStorage(() =>
        this.storage.completeMultipartUpload({
          ...this.toMultipartIdentity(claimed),
          parts,
        }),
      )

      const updated = await this.uploadRepository.markCompleted(
        ownerId,
        uploadSessionId,
        completed.etag,
      )

      if (!updated) {
        const recovered = await this.recoverCompletedObject(claimed)

        if (recovered) {
          return this.toCompletedResponse(recovered)
        }

        throw new Error('Completed object could not be persisted')
      }

      return this.toCompletedResponse(updated)
    } catch (cause: unknown) {
      if (!completeWasAttempted) {
        if (
          cause instanceof AppException &&
          cause.definition.code === UPLOAD_ERRORS.STORAGE_UPLOAD_MISSING.code
        ) {
          // UploadId 已经不存在，不能确定是外部清理还是曾经完成过。
          // 先尝试 HeadObject；仍无法恢复时不重新开放上传，交给后台清理流程判定。
          try {
            const recovered = await this.recoverCompletedObject(claimed)

            if (recovered) {
              return this.toCompletedResponse(recovered)
            }
          } catch {
            // 保留原始 STORAGE_UPLOAD_MISSING 错误，并继续保持 completing。
          }

          throw cause
        }

        // ListParts 失败或分片不完整时还没有发送 Complete，
        // 因此可以安全恢复为 uploading，让调用方修正后重试。
        await this.uploadRepository.resetCompleting(ownerId, uploadSessionId)
        throw cause
      }

      try {
        const recovered = await this.recoverCompletedObject(claimed)

        if (recovered) {
          return this.toCompletedResponse(recovered)
        }
      } catch {
        // 无法确认 MinIO 是否已完成时保持 completing，
        // 避免错误地重新开放分片上传。
        throw cause
      }

      // Complete 已经发出后，即使 HeadObject 暂时还看不到对象，也不能证明
      // MinIO 没有完成。保持 completing，由 GET 状态恢复或后台任务继续判定。
      throw cause
    }
  }

  async abort(ownerId: string, uploadSessionId: string) {
    let session = await this.requireSession(ownerId, uploadSessionId)

    if (session.status === 'aborted') {
      return {
        uploadSessionId,
        status: 'aborted' as const,
      }
    }

    if (session.status === 'completed' || session.status === 'completing') {
      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    const claimed = await this.uploadRepository.claimAborting(ownerId, uploadSessionId)

    if (!claimed) {
      session = await this.requireSession(ownerId, uploadSessionId)

      if (session.status === 'aborted') {
        return {
          uploadSessionId,
          status: 'aborted' as const,
        }
      }

      throw new AppException(UPLOAD_ERRORS.INVALID_STATE)
    }

    await this.callStorage(() =>
      this.storage.abortMultipartUpload(this.toMultipartIdentity(claimed)),
    )

    const aborted = await this.uploadRepository.markAborted(ownerId, uploadSessionId)

    if (!aborted) {
      const latest = await this.uploadRepository.findById(ownerId, uploadSessionId)

      if (latest?.status === 'aborted') {
        return {
          uploadSessionId,
          status: 'aborted' as const,
        }
      }

      throw new Error('Aborted upload could not be persisted')
    }

    return {
      uploadSessionId,
      status: 'aborted' as const,
    }
  }

  private validateNewFile(fileSize: number): void {
    if (fileSize === 0) {
      throw new AppException(UPLOAD_ERRORS.FILE_EMPTY)
    }

    if (fileSize > UPLOAD_MAX_FILE_SIZE) {
      throw new AppException(UPLOAD_ERRORS.FILE_TOO_LARGE)
    }
  }

  private assertSameClientFile(session: UploadSession, input: InitiateMultipartUploadDto): void {
    if (
      session.originalName !== input.fileName.trim() ||
      session.fileSize !== input.fileSize ||
      session.contentType !== input.contentType.trim()
    ) {
      throw new AppException(UPLOAD_ERRORS.CLIENT_UPLOAD_ID_CONFLICT)
    }
  }

  private async requireSession(ownerId: string, uploadSessionId: string): Promise<UploadSession> {
    const session = await this.uploadRepository.findById(ownerId, uploadSessionId)

    if (!session) {
      throw new AppException(UPLOAD_ERRORS.SESSION_NOT_FOUND)
    }

    return session
  }

  private async ensureNotExpired(session: UploadSession): Promise<void> {
    if (session.expiresAt.getTime() > Date.now()) {
      return
    }

    const expired = await this.uploadRepository.markExpired(session.ownerId, session.id)

    if (expired) {
      await this.safeAbort(this.toMultipartIdentity(expired))
    }

    throw new AppException(UPLOAD_ERRORS.UPLOAD_EXPIRED)
  }

  private parseContentLength(value: string | undefined): number {
    if (!value || !/^\d+$/.test(value)) {
      throw new AppException(UPLOAD_ERRORS.PART_LENGTH_REQUIRED)
    }

    const parsed = Number(value)

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new AppException(UPLOAD_ERRORS.PART_LENGTH_REQUIRED)
    }

    return parsed
  }

  private assertCompleteParts(session: UploadSession, parts: readonly StoragePart[]): void {
    if (parts.length !== session.totalParts) {
      throw new AppException(UPLOAD_ERRORS.PARTS_INCOMPLETE)
    }

    let totalBytes = 0

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const expectedPartNumber = index + 1

      if (!part || part.partNumber !== expectedPartNumber || !part.etag) {
        throw new AppException(UPLOAD_ERRORS.PARTS_INCOMPLETE)
      }

      const expectedSize = calculateExpectedPartSize(
        session.fileSize,
        session.totalParts,
        expectedPartNumber,
      )

      if (part.size !== expectedSize) {
        throw new AppException(UPLOAD_ERRORS.PARTS_INCOMPLETE)
      }

      totalBytes += part.size
    }

    if (totalBytes !== session.fileSize) {
      throw new AppException(UPLOAD_ERRORS.PARTS_INCOMPLETE)
    }
  }

  private async recoverCompletedObject(session: UploadSession): Promise<UploadSession | null> {
    const object = await this.callStorage(() =>
      this.storage.headObject({
        bucket: session.bucket,
        objectKey: session.objectKey,
      }),
    )

    if (
      !object ||
      object.metadata['upload-session-id'] !== session.id ||
      object.contentLength !== session.fileSize
    ) {
      return null
    }

    const updated = await this.uploadRepository.markCompleted(
      session.ownerId,
      session.id,
      object.etag,
    )

    if (updated) {
      return updated
    }

    const latest = await this.uploadRepository.findById(session.ownerId, session.id)

    return latest?.status === 'completed' ? latest : null
  }

  private toMultipartIdentity(session: UploadSession): MultipartIdentity {
    return {
      bucket: session.bucket,
      objectKey: session.objectKey,
      storageUploadId: session.storageUploadId,
    }
  }

  private toStatusResponse(
    session: UploadSession,
    parts: readonly StoragePart[],
  ): UploadStatusResponse {
    return {
      uploadSessionId: session.id,
      fileName: session.originalName,
      fileSize: session.fileSize,
      contentType: session.contentType,
      partSize: session.partSize,
      totalParts: session.totalParts,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
      uploadedParts: parts.map((part) => ({
        partNumber: part.partNumber,
        size: part.size,
        etag: part.etag,
      })),
    }
  }

  private toCompletedResponse(session: UploadSession): CompletedUploadResponse {
    return {
      uploadSessionId: session.id,
      status: 'completed',
      objectKey: session.objectKey,
      etag: session.objectEtag,
    }
  }

  private async callStorage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (cause: unknown) {
      if (cause instanceof AppException) {
        throw cause
      }

      if (findExactSizeError(cause)) {
        throw new AppException(UPLOAD_ERRORS.PART_SIZE_MISMATCH)
      }

      if (cause instanceof StorageMultipartNotFoundError) {
        throw new AppException(UPLOAD_ERRORS.STORAGE_UPLOAD_MISSING)
      }

      if (this.isAbortError(cause)) {
        throw new AppException(UPLOAD_ERRORS.PART_UPLOAD_ABORTED)
      }

      throw new AppException(UPLOAD_ERRORS.STORAGE_UNAVAILABLE, { cause })
    }
  }

  private isAbortError(cause: unknown): boolean {
    let current = cause

    for (let depth = 0; depth < 8; depth += 1) {
      if (
        typeof current === 'object' &&
        current !== null &&
        'name' in current &&
        current.name === 'AbortError'
      ) {
        return true
      }

      if (typeof current !== 'object' || current === null || !('cause' in current)) {
        return false
      }

      current = current.cause
    }

    return false
  }

  private async safeAbort(identity: MultipartIdentity): Promise<void> {
    try {
      await this.storage.abortMultipartUpload(identity)
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause)
      this.logger.warn(`Compensating AbortMultipartUpload failed: ${message}`)
      // 这里只做补偿。失败时由 Bucket 生命周期规则兜底清理孤儿分片。
    }
  }
}
```

### 关键逻辑解释

#### 1. 初始化为什么先创建 MinIO Multipart，再写数据库

MinIO 的 `UploadId` 只能由存储服务生成，所以先创建 Multipart，再保存到数据库。如果数据库写失败，`catch` 会尝试 Abort。

如果两个相同 `clientUploadId` 请求并发到达，数据库唯一约束只允许一个成为 winner；loser 创建出的 MinIO Multipart 会被 Abort。

仍然存在极小的崩溃窗口：

```text
MinIO Create 成功
  ↓
Node 进程在数据库写入前被强制杀死
```

这类孤儿分片无法靠应用补偿，必须由 MinIO Bucket 生命周期规则兜底。

#### 2. 后端为什么同时检查 Content-Length 和真实流

- `Content-Length` 不匹配时，不必连接 MinIO 就可以立即拒绝。
- 客户端可以伪造普通 HTTP 请求，所以还要用 `ExactSizeTransform` 检查真正读到的字节。
- 浏览器发送 Blob 时会自动生成 Content-Length，JavaScript 不能也不需要手动设置这个受限请求头。
- Node.js 源 `Readable` 的 `error` 不会因为调用 `.pipe()` 就自动可靠地传给目标 `Transform`，所以代码显式调用 `exactSizeStream.destroy(cause)`，并在 `finally` 中移除监听器。
- MinIO 或 SDK 提前失败时，代码会 `unpipe` 并销毁目标 Transform，再用 `resume()` 排空尚未到达的请求体；这样不会把整片缓存进内存，也不会让 HTTP 连接因为请求体无人消费而长期停滞。

#### 3. 为什么完成接口不接收前端 ETag 数组

可能发生：

```text
MinIO 已保存分片
  ↓
NestJS 返回响应前断网
  ↓
前端以为这一片失败
```

MinIO 才是分片真实状态。完成时重新 `ListParts`，检查：

- 数量是否等于 `totalParts`。
- 编号是否连续且为 `1...totalParts`。
- 每片大小是否正确。
- 总字节数是否等于 `fileSize`。
- 每片是否都有 ETag。

#### 4. `completing` 为什么要配合 HeadObject

可能发生“MinIO 已合并成功，但数据库更新失败或响应丢失”。再次完成时用唯一对象 Key 查询最终对象，并检查：

- 对象 Metadata 的 `upload-session-id`。
- 对象 Content-Length。

确认是本会话的对象后，再把数据库修复为 `completed`。如果连 HeadObject 都失败，保持 `completing`，避免错误地重新开放分片上传。

代码用 `completeWasAttempted` 区分两个阶段：ListParts 失败或分片不完整时尚未调用 MinIO Complete，可以安全把状态恢复为 `uploading`；Complete 一旦发出，结果就可能不确定，此后必须保持 `completing` 并用 HeadObject 或后台任务恢复，不能贸然重新开放分片。

#### 5. 后端为什么不自动重试 UploadPart

Node.js 请求流被读过后不能可靠回放。后端重试可能发送空流或半片。前端保留着原始 `File`，可以重新执行 `file.slice()`，所以分片重试应放在前端。

### 验证

完成 Controller 后，用 25 MiB 文件验证：

- 初始化返回 `totalParts: 3`、`partSize: 10485760`。
- 前两片返回 `size: 10485760`。
- 第三片返回 `size: 5242880`。
- 少传一片就调用 complete，应返回 HTTP 409 和 `UPLOAD.PARTS_INCOMPLETE`。
- 相同 `partNumber` 重传后，状态中仍只有一个该编号。

### 常见错误

- 把整个 Service 包在一个 catch 中，任何程序错误都伪装成 MinIO 503。
- 完成请求直接使用前端提交的 ETag，不重新 ListParts。
- 只检查分片数量，不检查编号连续性和每片大小。
- MinIO Complete 成功后数据库更新失败，却把状态直接重置为 uploading，导致再次上传到已经消失的 UploadId。
- `safeAbort` 没有生命周期兜底，补偿失败后分片永久占空间。

---

## 第 12 步：实现 Controller

### 本步目标

把五个 API 暴露给浏览器，沿用现有全局 Session Guard，并在客户端断开时取消 NestJS 到 MinIO 的请求。

### 文件位置

新建：

```text
apps/server/src/modules/upload/upload.controller.ts
```

### 完整代码

```ts
import { CurrentAuth } from '@/common/decorators/current-auth.decorator'
import type { CurrentAuthType } from '@/modules/auth/session/session.types'
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Readable } from 'node:stream'
import { InitiateMultipartUploadDto } from './dto/initiate-multipart-upload.dto'
import { UploadPartParamsDto, UploadSessionParamsDto } from './dto/upload-params.dto'
import { UploadService } from './upload.service'

type OctetStreamRequest = FastifyRequest & {
  body: Readable
}

@ApiTags('大文件分片上传')
@ApiBearerAuth('session')
@Controller('uploads/multipart')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @ApiOperation({ summary: '初始化大文件分片上传' })
  @Post()
  initiate(@CurrentAuth() auth: CurrentAuthType, @Body() body: InitiateMultipartUploadDto) {
    return this.uploadService.initiate(auth.userId, body)
  }

  @ApiOperation({ summary: '查询上传状态和已上传分片' })
  @Get(':uploadSessionId')
  getStatus(@CurrentAuth() auth: CurrentAuthType, @Param() params: UploadSessionParamsDto) {
    return this.uploadService.getStatus(auth.userId, params.uploadSessionId)
  }

  @ApiOperation({ summary: '上传一个原始二进制分片' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @HttpCode(HttpStatus.OK)
  @Put(':uploadSessionId/parts/:partNumber')
  uploadPart(
    @CurrentAuth() auth: CurrentAuthType,
    @Param() params: UploadPartParamsDto,
    @Headers('content-length') contentLength: string | undefined,
    @Headers('content-encoding') contentEncoding: string | undefined,
    @Req() request: OctetStreamRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const abortController = new AbortController()
    const onAborted = () => abortController.abort()
    const onReplyClose = () => {
      if (!reply.raw.writableEnded) {
        abortController.abort()
      }
    }

    request.raw.once('aborted', onAborted)
    reply.raw.once('close', onReplyClose)

    return this.uploadService
      .uploadPart({
        ownerId: auth.userId,
        uploadSessionId: params.uploadSessionId,
        partNumber: params.partNumber,
        contentLength,
        contentEncoding,
        body: request.body,
        abortSignal: abortController.signal,
      })
      .finally(() => {
        // 前置校验失败时 Service 可能尚未 pipe 请求体。
        // 统一排空剩余字节，避免连接一直占用到代理超时；这里不会聚合 Buffer。
        if (!request.body.readableEnded && !request.body.destroyed) {
          request.body.resume()
        }

        request.raw.off('aborted', onAborted)
        reply.raw.off('close', onReplyClose)
      })
  }

  @ApiOperation({ summary: '校验并完成分片上传' })
  @HttpCode(HttpStatus.OK)
  @Post(':uploadSessionId/complete')
  complete(@CurrentAuth() auth: CurrentAuthType, @Param() params: UploadSessionParamsDto) {
    return this.uploadService.complete(auth.userId, params.uploadSessionId)
  }

  @ApiOperation({ summary: '取消分片上传' })
  @HttpCode(HttpStatus.OK)
  @Delete(':uploadSessionId')
  abort(@CurrentAuth() auth: CurrentAuthType, @Param() params: UploadSessionParamsDto) {
    return this.uploadService.abort(auth.userId, params.uploadSessionId)
  }
}
```

### 代码解释

- 不加 `@Public()`，因此现有全局 `SessionAuthGuard` 会保护所有上传接口。
- 每个方法都用 `@CurrentAuth()` 取得 `auth.userId`。
- 分片端点不使用 `@Body()` DTO，因为它的 Body 是 Node.js 流。
- `request.raw` 触发 `aborted` 时，`AbortController` 会取消 AWS SDK 请求。
- 请求体已经发完、浏览器却在等待响应时断开，未必再触发 `request.raw.aborted`，所以还要监听响应流 `close`；只有 `writableEnded` 仍为 `false` 才视为异常断开。
- `Content-Encoding` 只允许空或 `identity`，避免代理或客户端压缩后破坏字节数协议。
- 即使状态、PartNumber 或 `Content-Length` 在 pipe 前就校验失败，Controller 的 `finally` 也会用 `resume()` 丢弃剩余请求体，避免原始流无人消费；它不会把请求体读进 Buffer。

### 验证

启动 Server：

```powershell
pnpm --filter server dev
```

打开：

```text
http://127.0.0.1:13000/api-docs
```

预期看到“大文件分片上传”分组和五个接口。

不带 Token 请求初始化：

```powershell
curl.exe -i -X POST http://127.0.0.1:13000/uploads/multipart -H "Content-Type: application/json" --data '{"clientUploadId":"00000000-0000-4000-8000-000000000001","fileName":"demo.bin","fileSize":10485760,"contentType":"application/octet-stream"}'
```

预期返回 401 和 `AUTH.SESSION_TOKEN_MISSING`。

### 常见错误

- 给上传 Controller 加 `@Public()`，导致任意人消耗存储和带宽。
- 分片端点写 `@Body() body: Buffer`，隐式整片缓存。
- 在浏览器代码中手动设置 `Content-Length`。浏览器禁止设置，发送 Blob 时会自动处理。
- 只监听前端取消，不取消后端正在进行的 MinIO 请求。

---

## 第 13 步：创建 Module 并接入 AppModule

### 本步目标

完成依赖注入：Controller → Service → Repository 和 Storage Port → MinIO Adapter。

### 文件位置

新建：

```text
apps/server/src/modules/upload/upload.module.ts
```

### 完整代码

```ts
import { Module } from '@nestjs/common'
import { MinioStorageAdapter } from './storage/minio-storage.adapter'
import { STORAGE_PORT } from './storage/storage.port'
import { UploadController } from './upload.controller'
import { UploadRepository } from './upload.repository'
import { UploadService } from './upload.service'

@Module({
  controllers: [UploadController],
  providers: [
    UploadRepository,
    UploadService,
    MinioStorageAdapter,
    {
      provide: STORAGE_PORT,
      useExisting: MinioStorageAdapter,
    },
  ],
})
export class UploadModule {}
```

### 文件位置

修改：

```text
apps/server/src/app.module.ts
```

### 完整代码

将文件替换为：

```ts
import {
  appConfig,
  databaseConfig,
  llmConfig,
  redisConfig,
  sessionConfig,
  storageConfig,
} from '@/config'
import { RedisModule } from '@nestjs-modules/ioredis'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { DatabaseModule } from './database/db.module'
import { AuthModule } from './modules/auth/auth.module'
import { TestDbModule } from './modules/test/db/db.module'
import { TestRedisModule } from './modules/test/redis/redis.module'
import { UploadModule } from './modules/upload/upload.module'
import { ENV_ARR } from './utils/env-arr'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ENV_ARR,
      load: [appConfig, databaseConfig, llmConfig, redisConfig, sessionConfig, storageConfig],
    }),
    DatabaseModule,
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config) => ({
        type: 'single',
        options: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password'),
          db: config.get('redis.db'),
          connectTimeout: 3000,
          commandTimeout: 2000,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        },
      }),
    }),
    TestRedisModule,
    TestDbModule,
    AuthModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
```

### 代码解释

`useExisting` 表示 `STORAGE_PORT` 和 `MinioStorageAdapter` 使用同一个实例，不会重复创建 S3Client。

`DatabaseModule` 已经是全局模块，`ConfigModule` 也是全局配置，因此 `UploadModule` 不需要重复导入它们。

### 验证

```powershell
pnpm --filter server build
pnpm --filter server test
vp check
```

预期：

- 没有 `Nest can't resolve dependencies`。
- `vp check` 没有 TypeScript 路径、未使用导入或 AWS SDK 类型错误。
- 错误目录测试通过。

当前 Server 构建使用 SWC 且 `typeCheck: false`，所以 `build` 成功不能替代 `vp check`；两者用途不同。

### 常见错误

- Provider 使用 `useClass` 又单独注册 Adapter，创建两个 S3Client 实例。
- 忘记在 AppModule 导入 UploadModule，Swagger 中完全看不到接口。
- 只在 `config/index.ts` 导出配置，没有加入 `load` 数组。

---

## 第 14 步：增加分片规则和流测试

### 本步目标

先用纯单元测试锁住最容易出错的两部分：最后一片计算和真实流字节数。

### 文件位置

新建：

```text
apps/server/test/upload-constants.spec.ts
```

### 完整代码

```ts
import {
  calculateExpectedPartSize,
  calculateTotalParts,
  UPLOAD_PART_SIZE,
} from '@/modules/upload/upload.constants'
import { describe, expect, it } from 'vite-plus/test'

describe('upload constants', () => {
  it('splits a 25 MiB file into 10 + 10 + 5 MiB', () => {
    const fileSize = 25 * 1024 * 1024
    const totalParts = calculateTotalParts(fileSize)

    expect(totalParts).toBe(3)
    expect(calculateExpectedPartSize(fileSize, totalParts, 1)).toBe(UPLOAD_PART_SIZE)
    expect(calculateExpectedPartSize(fileSize, totalParts, 2)).toBe(UPLOAD_PART_SIZE)
    expect(calculateExpectedPartSize(fileSize, totalParts, 3)).toBe(5 * 1024 * 1024)
  })

  it('uses one full part when file size is exactly 10 MiB', () => {
    expect(calculateTotalParts(UPLOAD_PART_SIZE)).toBe(1)
    expect(calculateExpectedPartSize(UPLOAD_PART_SIZE, 1, 1)).toBe(UPLOAD_PART_SIZE)
  })

  it('rejects a part number outside the file range', () => {
    expect(() => calculateExpectedPartSize(UPLOAD_PART_SIZE, 1, 2)).toThrow(RangeError)
  })
})
```

### 文件位置

新建：

```text
apps/server/test/upload-stream.spec.ts
```

### 完整代码

```ts
import { ExactSizeError, ExactSizeTransform } from '@/modules/upload/storage/exact-size.transform'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { describe, expect, it } from 'vite-plus/test'

async function consume(actualBytes: number, expectedBytes: number) {
  await pipeline(
    Readable.from([Buffer.alloc(actualBytes)]),
    new ExactSizeTransform(expectedBytes),
    new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    }),
  )
}

describe('ExactSizeTransform', () => {
  it('accepts the exact byte count', async () => {
    await expect(consume(1024, 1024)).resolves.toBeUndefined()
  })

  it('rejects a stream that is too large', async () => {
    await expect(consume(1025, 1024)).rejects.toBeInstanceOf(ExactSizeError)
  })

  it('rejects a stream that ends early', async () => {
    await expect(consume(1023, 1024)).rejects.toBeInstanceOf(ExactSizeError)
  })
})
```

### 验证

```powershell
pnpm --filter server test
vp check
```

预期新增的两个测试文件和原错误目录测试全部通过，并且 Vite+ 的格式、Lint、TypeScript 检查通过。当前 Nest build 使用 SWC 且 `typeCheck: false`，所以“能 build”不能替代 `vp check`。

### 还应补充的集成测试

真正用于生产前，还应使用独立 PostgreSQL 和 MinIO 测试以下场景：

- 用户 B 无法读取或操作用户 A 的会话。
- 同一个 `clientUploadId` 并发初始化只得到一个数据库会话。
- 同一个 PartNumber 重传后只有一个分片。
- 缺片、乱序或大小不正确时 Complete 返回 409。
- Complete 响应丢失后，第二次 Complete 能通过 HeadObject 恢复。
- Abort 重复调用仍然成功。
- 过期会话不能继续上传。
- `ListParts` 超过 1000 片时正确分页。
- 请求源流报错会销毁传给 MinIO 的 Transform。
- 浏览器请求体发完后异常断开，仍会取消到 MinIO 的请求。
- 无效会话状态或错误 `Content-Length` 携带较大请求体时，请求体仍会被排空，后续请求可以复用连接。

不要把真实 MinIO 集成测试和普通单元测试混用同一个生产 Bucket。

### 常见错误

- 只运行 `nest build`，误以为 SWC 构建已经完成 TypeScript 类型检查。
- 流测试只验证“正好大小”，没有覆盖过大和提前结束。
- 集成测试直接连接共享或生产 Bucket，失败清理时污染真实数据。
- 只测几十片，漏掉 `ListParts` 每页通常最多 1000 片的分页边界。

---

## 第 15 步：增加最小 React 前端联调代码

这一部分不是后端必须文件，但你是前端开发者，建议先照着它验证完整协议，再封装成项目自己的 Hook 和页面。

### 本步目标

- JSON 控制接口使用项目现有 Alova。
- 分片 PUT 使用 XHR，获得稳定的上传进度、取消能力和 HTTP 状态。
- 默认并发 3，最大 5。
- 每片最多尝试 3 次。
- 暂停后不调用 DELETE；恢复时使用同一个 `clientUploadId` 并重新查询状态。

### 文件位置

先修正开发代理：

```text
apps/web/.env.dev
```

把：

```dotenv
VITE_API_URL = http://localhost:10000
```

改为：

```dotenv
VITE_API_URL = http://localhost:13000
```

修改环境变量后必须重启前端开发服务器。

### 文件位置

新建：

```text
apps/web/src/services/multipart-upload.ts
```

### 完整代码

```ts
import { envVariables } from '@/utils/env'
import alovaRequest from '@/utils/request'

export type UploadSessionStatus =
  | 'uploading'
  | 'completing'
  | 'completed'
  | 'aborting'
  | 'aborted'
  | 'expired'

export interface UploadedPart {
  partNumber: number
  size: number
  etag: string
}

export interface UploadStatusResponse {
  uploadSessionId: string
  fileName: string
  fileSize: number
  contentType: string
  partSize: number
  totalParts: number
  status: UploadSessionStatus
  expiresAt: string
  uploadedParts: UploadedPart[]
}

export interface CompletedUploadResponse {
  uploadSessionId: string
  status: 'completed'
  objectKey: string
  etag: string | null
}

export interface InitiateUploadInput {
  clientUploadId: string
  fileName: string
  fileSize: number
  contentType: string
}

const API_PATH = 'uploads/multipart'
const CONTROL_REQUEST_TIMEOUT_MS = 30 * 1000
const ABORT_REQUEST_TIMEOUT_MS = 60 * 1000
const COMPLETE_REQUEST_TIMEOUT_MS = 10 * 60 * 1000
const uploadRequest = alovaRequest({
  isWrapped: false,
  isShowSuccessMessage: false,
  isShowErrorMessage: false,
})

interface AbortableMethod<T> {
  send: () => Promise<T>
  abort: () => Promise<void>
}

async function sendMethod<T>(method: AbortableMethod<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    throw new DOMException('Upload paused or cancelled', 'AbortError')
  }

  const onAbort = () => {
    void method.abort().catch(() => undefined)
  }

  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    return await method.send()
  } catch (cause: unknown) {
    if (signal?.aborted) {
      throw new DOMException('Upload paused or cancelled', 'AbortError')
    }

    throw cause
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

function authorization(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

export function buildUploadApiUrl(path: string): string {
  const rawBase = (envVariables.API_AFFIX || '').replace(/\/+$/, '')
  const base =
    !rawBase || rawBase.startsWith('/') || /^https?:\/\//.test(rawBase) ? rawBase : `/${rawBase}`
  const normalizedPath = path.replace(/^\/+/, '')

  return `${base}/${normalizedPath}`
}

export function initiateMultipartUpload(
  input: InitiateUploadInput,
  accessToken: string,
  signal?: AbortSignal,
) {
  const method = uploadRequest.Post<UploadStatusResponse>(API_PATH, input, {
    headers: authorization(accessToken),
    timeout: CONTROL_REQUEST_TIMEOUT_MS,
  })

  return sendMethod(method, signal)
}

export function getMultipartUploadStatus(
  uploadSessionId: string,
  accessToken: string,
  signal?: AbortSignal,
) {
  const method = uploadRequest.Get<UploadStatusResponse>(`${API_PATH}/${uploadSessionId}`, {
    headers: authorization(accessToken),
    timeout: CONTROL_REQUEST_TIMEOUT_MS,
  })

  return sendMethod(method, signal)
}

export function completeMultipartUpload(
  uploadSessionId: string,
  accessToken: string,
  signal?: AbortSignal,
) {
  const method = uploadRequest.Post<CompletedUploadResponse>(
    `${API_PATH}/${uploadSessionId}/complete`,
    undefined,
    {
      headers: authorization(accessToken),
      timeout: COMPLETE_REQUEST_TIMEOUT_MS,
    },
  )

  return sendMethod(method, signal)
}

export function abortMultipartUpload(
  uploadSessionId: string,
  accessToken: string,
  signal?: AbortSignal,
) {
  const method = uploadRequest.Delete<{
    uploadSessionId: string
    status: 'aborted'
  }>(`${API_PATH}/${uploadSessionId}`, undefined, {
    headers: authorization(accessToken),
    timeout: ABORT_REQUEST_TIMEOUT_MS,
  })

  return sendMethod(method, signal)
}

export function getUploadPartUrl(uploadSessionId: string, partNumber: number): string {
  return buildUploadApiUrl(`${API_PATH}/${uploadSessionId}/parts/${partNumber}`)
}
```

### 为什么这里必须 `isWrapped: false`

当前请求封装默认期望：

```json
{
  "code": 200,
  "data": {}
}
```

但当前 NestJS Controller 成功时直接返回：

```json
{
  "uploadSessionId": "...",
  "status": "uploading"
}
```

不设置 `isWrapped: false` 时，HTTP 明明是 200，前端仍可能因为找不到外层 `code/data` 而判定失败。

### 文件位置

新建：

```text
apps/web/src/utils/file-upload/multipart-uploader.ts
```

### 完整代码

```ts
import {
  completeMultipartUpload,
  getMultipartUploadStatus,
  getUploadPartUrl,
  initiateMultipartUpload,
  type CompletedUploadResponse,
} from '@/services/multipart-upload'

const DEFAULT_CONCURRENCY = 3
const MAX_CONCURRENCY = 5
const MAX_ATTEMPTS = 3
const PART_REQUEST_TIMEOUT_MS = 10 * 60 * 1000
const COMPLETING_POLL_INTERVAL_MS = 1000
const COMPLETING_MAX_POLLS = 60

export class UploadPartHttpError extends Error {
  readonly status: number
  readonly responseBody: unknown

  constructor(status: number, responseBody: unknown) {
    super(`Upload part failed with HTTP ${status}`)
    this.name = UploadPartHttpError.name
    this.status = status
    this.responseBody = responseBody
  }
}

export class UploadPartNetworkError extends Error {
  constructor(message = 'Upload part failed because of a network error') {
    super(message)
    this.name = UploadPartNetworkError.name
  }
}

interface UploadChunkInput {
  url: string
  chunk: Blob
  accessToken: string
  signal: AbortSignal
  onProgress: (loaded: number) => void
}

function parseResponseBody(text: string): unknown {
  if (!text) return undefined

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function uploadChunk(input: UploadChunkInput): Promise<void> {
  if (input.signal.aborted) {
    return Promise.reject(new DOMException('Upload paused or cancelled', 'AbortError'))
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const onAbort = () => xhr.abort()

    const cleanup = () => {
      input.signal.removeEventListener('abort', onAbort)
    }

    xhr.open('PUT', input.url)
    xhr.timeout = PART_REQUEST_TIMEOUT_MS
    xhr.setRequestHeader('Authorization', `Bearer ${input.accessToken}`)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')

    xhr.upload.onprogress = (event) => {
      input.onProgress(event.loaded)
    }

    xhr.onload = () => {
      cleanup()

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }

      reject(new UploadPartHttpError(xhr.status, parseResponseBody(xhr.responseText)))
    }

    xhr.onerror = () => {
      cleanup()
      reject(new UploadPartNetworkError())
    }

    xhr.ontimeout = () => {
      cleanup()
      reject(new UploadPartNetworkError('Upload part request timed out'))
    }

    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Upload paused or cancelled', 'AbortError'))
    }

    input.signal.addEventListener('abort', onAbort, { once: true })
    xhr.send(input.chunk)
  })
}

function isRetryable(error: unknown): boolean {
  if (error instanceof UploadPartNetworkError) {
    return true
  }

  if (error instanceof UploadPartHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500
  }

  return false
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Upload paused or cancelled', 'AbortError'))
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Upload paused or cancelled', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function uploadChunkWithRetry(input: UploadChunkInput): Promise<void> {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      input.onProgress(0)
      await uploadChunk(input)
      return
    } catch (error: unknown) {
      lastError = error

      if (attempt === MAX_ATTEMPTS || !isRetryable(error) || input.signal.aborted) {
        throw error
      }

      const baseDelay = 500 * 2 ** (attempt - 1)
      const jitter = Math.floor(Math.random() * 300)
      await wait(baseDelay + jitter, input.signal)
    }
  }

  throw lastError
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Upload paused or cancelled', 'AbortError')
  }
}

export type UploadPhase = 'initializing' | 'uploading' | 'completing' | 'completed'

export interface UploadSessionSnapshot {
  uploadSessionId?: string
  clientUploadId: string
  fileName: string
  fileSize: number
  contentType: string
  lastModified: number
}

export interface UploadMultipartFileOptions {
  file: File
  clientUploadId: string
  accessToken: string
  concurrency?: number
  signal?: AbortSignal
  onSession?: (session: UploadSessionSnapshot) => void
  onPhaseChange?: (phase: UploadPhase) => void
  onProgress?: (input: { loaded: number; total: number; percentage: number }) => void
}

async function waitForCompletedStatus(
  uploadSessionId: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<void> {
  for (let poll = 0; poll < COMPLETING_MAX_POLLS; poll += 1) {
    throwIfAborted(signal)
    const status = await getMultipartUploadStatus(uploadSessionId, accessToken, signal)
    throwIfAborted(signal)

    if (status.status === 'completed') {
      return
    }

    if (status.status !== 'completing') {
      throw new Error(`Upload left completing state: ${status.status}`)
    }

    if (signal) {
      await wait(COMPLETING_POLL_INTERVAL_MS, signal)
    } else {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, COMPLETING_POLL_INTERVAL_MS)
      })
    }
  }

  throw new Error('Upload is still completing; retry status query later')
}

async function completeWithRecovery(
  uploadSessionId: string,
  accessToken: string,
): Promise<CompletedUploadResponse> {
  try {
    return await completeMultipartUpload(uploadSessionId, accessToken)
  } catch (completeError: unknown) {
    let status: Awaited<ReturnType<typeof getMultipartUploadStatus>>

    try {
      status = await getMultipartUploadStatus(uploadSessionId, accessToken)
    } catch {
      throw completeError
    }

    if (status.status === 'completing') {
      try {
        await waitForCompletedStatus(uploadSessionId, accessToken)
      } catch {
        throw completeError
      }
    } else if (status.status !== 'completed') {
      throw completeError
    }

    // 第一次 Complete 可能已成功，只是响应在网络中丢失。
    // 再调用一次幂等 Complete，取回完整的对象信息。
    return completeMultipartUpload(uploadSessionId, accessToken)
  }
}

export async function uploadMultipartFile(
  options: UploadMultipartFileOptions,
): Promise<CompletedUploadResponse> {
  const { file, clientUploadId, accessToken, onProgress, onSession, onPhaseChange } = options
  const concurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY)),
  )
  const controller = new AbortController()
  const abortWorkers = () => controller.abort()

  throwIfAborted(options.signal ?? controller.signal)

  options.signal?.addEventListener('abort', abortWorkers, { once: true })

  try {
    onPhaseChange?.('initializing')
    throwIfAborted(controller.signal)
    const initiated = await initiateMultipartUpload(
      {
        clientUploadId,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || 'application/octet-stream',
      },
      accessToken,
      controller.signal,
    )
    onSession?.({
      uploadSessionId: initiated.uploadSessionId,
      clientUploadId,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream',
      lastModified: file.lastModified,
    })

    throwIfAborted(controller.signal)
    const status = await getMultipartUploadStatus(
      initiated.uploadSessionId,
      accessToken,
      controller.signal,
    )
    throwIfAborted(controller.signal)

    if (status.status === 'completing') {
      onPhaseChange?.('completing')
      await waitForCompletedStatus(status.uploadSessionId, accessToken)
      const completed = await completeWithRecovery(status.uploadSessionId, accessToken)
      onPhaseChange?.('completed')
      return completed
    }

    if (status.status === 'completed') {
      onPhaseChange?.('completing')
      const completed = await completeWithRecovery(status.uploadSessionId, accessToken)
      onPhaseChange?.('completed')
      return completed
    }

    if (status.status !== 'uploading') {
      throw new Error(`Upload cannot continue from status ${status.status}`)
    }

    onPhaseChange?.('uploading')

    const uploadedPartNumbers = new Set(status.uploadedParts.map((part) => part.partNumber))
    const loadedByPart = new Map<number, number>(
      status.uploadedParts.map((part) => [part.partNumber, part.size]),
    )

    const reportProgress = () => {
      const loaded = Array.from(loadedByPart.values()).reduce((sum, value) => sum + value, 0)

      onProgress?.({
        loaded,
        total: file.size,
        percentage: file.size === 0 ? 0 : (loaded / file.size) * 100,
      })
    }

    reportProgress()

    let nextPartNumber = 1

    const worker = async () => {
      for (;;) {
        while (nextPartNumber <= status.totalParts && uploadedPartNumbers.has(nextPartNumber)) {
          nextPartNumber += 1
        }

        if (nextPartNumber > status.totalParts) {
          return
        }

        const partNumber = nextPartNumber
        nextPartNumber += 1

        const start = (partNumber - 1) * status.partSize
        const end = Math.min(start + status.partSize, file.size)
        const chunk = file.slice(start, end, 'application/octet-stream')

        loadedByPart.set(partNumber, 0)
        reportProgress()

        await uploadChunkWithRetry({
          url: getUploadPartUrl(status.uploadSessionId, partNumber),
          chunk,
          accessToken,
          signal: controller.signal,
          onProgress: (loaded) => {
            loadedByPart.set(partNumber, Math.min(loaded, chunk.size))
            reportProgress()
          },
        })

        uploadedPartNumbers.add(partNumber)
        loadedByPart.set(partNumber, chunk.size)
        reportProgress()
      }
    }

    const workerCount = Math.min(concurrency, status.totalParts)

    try {
      await Promise.all(Array.from({ length: workerCount }, () => worker()))
    } catch (error: unknown) {
      controller.abort()
      throw error
    }

    throwIfAborted(controller.signal)
    onPhaseChange?.('completing')

    // Complete 一旦发出就是服务端合并操作，不再把“暂停”解释为撤销合并。
    const completed = await completeWithRecovery(status.uploadSessionId, accessToken)
    onPhaseChange?.('completed')
    return completed
  } finally {
    options.signal?.removeEventListener('abort', abortWorkers)
  }
}
```

### 文件位置：增加一个可运行的联调页

新建：

```text
apps/web/src/pages/upload-demo/index.tsx
```

下面页面故意把 Token 做成输入框，方便你先验证上传协议。接入正式业务时，应从项目登录状态读取 Access Token，不要让用户手工填写。

### 完整代码

```tsx
import { useRef, useState } from 'react'
import { abortMultipartUpload, initiateMultipartUpload } from '@/services/multipart-upload'
import {
  uploadMultipartFile,
  type UploadPhase,
  type UploadSessionSnapshot,
} from '@/utils/file-upload/multipart-uploader'

const RESUME_STORAGE_KEY = 'multipart-upload-demo'

type ResumeRecord = UploadSessionSnapshot

function readResumeRecord(): ResumeRecord | null {
  try {
    const value = localStorage.getItem(RESUME_STORAGE_KEY)
    return value ? (JSON.parse(value) as ResumeRecord) : null
  } catch {
    return null
  }
}

function matchesFile(record: ResumeRecord, file: File): boolean {
  return (
    record.fileName === file.name &&
    record.fileSize === file.size &&
    record.lastModified === file.lastModified &&
    record.contentType === (file.type || 'application/octet-stream')
  )
}

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

const UploadDemo = () => {
  const initialSession = readResumeRecord()
  const sessionRef = useRef<ResumeRecord | null>(initialSession)
  const controllerRef = useRef<AbortController | null>(null)
  const activeTaskRef = useRef<Promise<unknown> | null>(null)
  const cancellingRef = useRef(false)
  const initialPhase = initialSession ? 'paused' : 'idle'
  const phaseRef = useRef<UploadPhase | 'paused' | 'idle'>(initialPhase)

  const [file, setFile] = useState<File | null>(null)
  const [accessToken, setAccessToken] = useState('')
  const [session, setSession] = useState<ResumeRecord | null>(initialSession)
  const [phase, setPhase] = useState<UploadPhase | 'paused' | 'idle'>(initialPhase)
  const [percentage, setPercentage] = useState(0)
  const [message, setMessage] = useState(
    initialSession
      ? '检测到未完成记录，请重新选择原文件并填写 Access Token'
      : '请选择文件并填写 Access Token',
  )
  const [storageWarning, setStorageWarning] = useState('')
  const [running, setRunning] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const changePhase = (next: UploadPhase | 'paused' | 'idle') => {
    phaseRef.current = next
    setPhase(next)
  }

  const saveSession = (next: ResumeRecord) => {
    sessionRef.current = next
    setSession(next)

    try {
      localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(next))
      setStorageWarning('')
    } catch {
      setStorageWarning('浏览器无法保存恢复记录；当前上传仍会继续，但刷新页面后无法自动恢复。')
    }
  }

  const clearSession = () => {
    sessionRef.current = null
    setSession(null)

    try {
      localStorage.removeItem(RESUME_STORAGE_KEY)
      setStorageWarning('')
    } catch {
      setStorageWarning('浏览器无法清理恢复记录，请手工清除此站点的数据。')
    }
  }

  const startOrResume = async () => {
    if (activeTaskRef.current || cancellingRef.current) {
      return
    }

    if (!file) {
      setMessage('请先选择文件')
      return
    }

    if (!accessToken.trim()) {
      setMessage('请先填写 Access Token')
      return
    }

    const saved = sessionRef.current
    if (saved && !matchesFile(saved, file)) {
      setMessage('存在未完成会话：请选择原文件恢复，或先点“取消并释放”')
      return
    }

    const resumeRecord: ResumeRecord = saved ?? {
      clientUploadId: crypto.randomUUID(),
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream',
      lastModified: file.lastModified,
    }
    saveSession(resumeRecord)

    const controller = new AbortController()
    controllerRef.current = controller
    setRunning(true)
    setMessage(saved ? '正在恢复上传' : '正在初始化上传')

    const task = uploadMultipartFile({
      file,
      clientUploadId: resumeRecord.clientUploadId,
      accessToken: accessToken.trim(),
      concurrency: 3,
      signal: controller.signal,
      onSession: saveSession,
      onPhaseChange: (nextPhase) => {
        changePhase(nextPhase)
        setMessage(
          nextPhase === 'completing'
            ? '分片已发送，MinIO 正在合并；此阶段不要再点暂停'
            : `当前阶段：${nextPhase}`,
        )
      },
      onProgress: (progress) => setPercentage(progress.percentage),
    })

    activeTaskRef.current = task

    try {
      const result = await task
      clearSession()
      setMessage(`上传完成：${result.objectKey}`)
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        changePhase('paused')
        setMessage('已暂停。恢复时必须重新创建 AbortController。')
      } else {
        setMessage(`上传失败：${getErrorMessage(cause)}`)
      }
    } finally {
      if (activeTaskRef.current === task) {
        activeTaskRef.current = null
      }
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
      setRunning(false)
    }
  }

  const pause = () => {
    if (phaseRef.current === 'completing') {
      return
    }

    controllerRef.current?.abort()
  }

  const cancelAndRelease = async () => {
    if (cancellingRef.current) {
      return
    }

    if (!accessToken.trim()) {
      setMessage('取消会话也需要 Access Token')
      return
    }

    if (phaseRef.current === 'completing') {
      setMessage('MinIO 已进入合并阶段，不能再取消；请等待状态恢复。')
      return
    }

    cancellingRef.current = true
    setCancelling(true)
    setMessage('正在停止分片并释放 MinIO 会话')

    try {
      controllerRef.current?.abort()

      try {
        await activeTaskRef.current
      } catch {
        // 先等所有正在进行的 XHR 和后端 PUT 结束，再调用 DELETE。
      }

      let current = sessionRef.current
      if (!current) {
        setMessage('上传已经结束，没有可取消的会话')
        return
      }

      let uploadSessionId = current.uploadSessionId
      if (!uploadSessionId) {
        const recovered = await initiateMultipartUpload(
          {
            clientUploadId: current.clientUploadId,
            fileName: current.fileName,
            fileSize: current.fileSize,
            contentType: current.contentType,
          },
          accessToken.trim(),
        )
        uploadSessionId = recovered.uploadSessionId
        current = {
          ...current,
          uploadSessionId,
        }
        saveSession(current)
      }

      await abortMultipartUpload(uploadSessionId, accessToken.trim())
      clearSession()
      changePhase('idle')
      setPercentage(0)
      setMessage('已取消，并请求 MinIO 释放未完成分片')
    } catch (cause: unknown) {
      setMessage(`取消失败：${getErrorMessage(cause)}。恢复记录已保留。`)
    } finally {
      cancellingRef.current = false
      setCancelling(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">10 MiB 分片上传联调</h1>

      <label className="flex flex-col gap-2">
        <span>Access Token</span>
        <textarea
          className="min-h-24 rounded border p-2"
          disabled={running || cancelling}
          value={accessToken}
          onChange={(event) => setAccessToken(event.target.value)}
        />
      </label>

      <input
        disabled={running || cancelling}
        type="file"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />

      <progress className="w-full" max={100} value={percentage} />
      <div>{percentage.toFixed(2)}%</div>
      <div>{message}</div>
      {storageWarning ? <div className="text-amber-700">{storageWarning}</div> : null}
      <div>会话：{session?.uploadSessionId ?? '等待初始化'}</div>

      <div className="flex gap-3">
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={running || cancelling}
          type="button"
          onClick={() => void startOrResume()}
        >
          {phase === 'paused' ? '恢复' : '开始上传'}
        </button>
        <button
          className="rounded border px-4 py-2 disabled:opacity-50"
          disabled={!running || cancelling || phase === 'completing'}
          type="button"
          onClick={pause}
        >
          暂停
        </button>
        <button
          className="rounded border border-red-500 px-4 py-2 text-red-600 disabled:opacity-50"
          disabled={cancelling || phase === 'completing'}
          type="button"
          onClick={() => void cancelAndRelease()}
        >
          {cancelling ? '正在取消' : '取消并释放'}
        </button>
      </div>
    </main>
  )
}

export default UploadDemo
```

### 文件位置：注册联调路由

修改：

```text
apps/web/src/router/index.tsx
```

在 `routes` 数组中增加：

```tsx
{
  path: '/upload-demo',
  id: 'upload-demo',
  element: lazyLoad('upload-demo'),
},
```

启动前端后访问：

```text
http://127.0.0.1:9999/upload-demo
```

暂停会中断当前分片 XHR，也会通过 Alova Method 的 `abort()` 中断正在进行的初始化或状态 GET，但不会 DELETE MinIO Multipart。恢复时必须重新选择同一个文件，并使用 LocalStorage 保存的同一个 `clientUploadId`。已经 `abort()` 的 `AbortController` 永远不能恢复，所以每次点击“恢复”都必须创建新实例。

示例会在初始化请求发出**之前**先保存 `clientUploadId`、文件名、文件大小、MIME 和 `lastModified`，服务端响应后再补上 `uploadSessionId`，但不会把整个文件塞进 LocalStorage。这样即使“服务端已创建会话、初始化响应却丢失”，下次仍会复用同一个 `clientUploadId` 找回会话。LocalStorage 写入失败不会中断本次上传，只是无法跨刷新恢复。

真正取消时先停止并等待当前 PUT 结束，再调用 DELETE；若初始化响应丢失且本地还没有 `uploadSessionId`，取消流程会先用同一个 `clientUploadId` 幂等初始化以找回会话，然后 Abort。DELETE 失败会保留恢复记录并显示错误，不会产生未处理的 Promise rejection。进入 `completing` 后，暂停和取消按钮都会禁用。

### 为什么分片用 XHR，而控制接口用 Alova

- Alova 继续统一处理 JSON、认证失败和项目请求约定。
- XHR 对上传进度、HTTP 状态、取消的行为稳定且直观。
- 不会绕过项目的后端协议，只是为二进制分片选择更合适的浏览器传输 API。

XHR 的 `timeout` 是 10 分钟，超时与普通网络错误一样允许重试。`MAX_ATTEMPTS = 3` 表示总尝试 3 次，并不是“首次请求之外再重试 3 次”。每次尝试前都把该片进度归零，避免失败重试时总进度虚高。

进度到 100% 只表示浏览器字节已经发送完，不表示最终对象已经可用。页面必须继续显示 `completing`，等 Complete 成功后才进入 `completed`。Complete 一旦发到后端，暂停按钮不再撤销这次合并。如果 Complete 成功但 HTTP 响应丢失，前端会查询状态：`completing` 就轮询，`completed` 就再次调用幂等 Complete 取回完整响应；若状态仍是 `uploading`，保留原错误，等用户恢复后重试。

开发环境的 `/api` 由 Vite 代理并去掉前缀；`VITE_API_URL` 只是 Vite 开发代理目标，不应该拿它在浏览器里直接拼 XHR URL。生产优先保持同源：继续让 `apps/web/.env` 使用 `VITE_API_AFFIX=/api`，由站点 Nginx 把 `/api` 反代到 NestJS。

只有确认前端和 API 必须跨域时，才在实际生产构建读取的环境文件中设置：

```dotenv
# apps/web/.env.prod
VITE_API_AFFIX=https://api.example.com/api
```

当前 `apps/web/package.json` 的 build 脚本是 `vp build --mode dev`，它不会读取 `.env.prod`。如果部署约定使用 `.env.prod`，应把脚本改为 `vp build --mode prod`；也可以由 CI 在构建时显式注入 `VITE_API_AFFIX`。跨域时再配置 NestJS/API 网关 CORS：请求头至少允许 `Authorization`、`Content-Type`，方法至少允许 `GET`、`POST`、`PUT`、`DELETE`、`OPTIONS`；仍然不需要 MinIO CORS。

如果后续确认当前 Alova Axios Adapter 的上传进度类型完全满足项目需要，可以再把 XHR 换成 Alova Method 的上传进度能力，后端 API 无需修改。

### 验证

在浏览器开发者工具中检查一次 25 MiB 上传，预期看到：

- 一个初始化 POST。
- 一个状态 GET。
- 三个分片 PUT，每个请求体分别是 10 MiB、10 MiB、5 MiB。
- 最后一个 Complete POST。
- 任意时刻最多只有 3 个分片 PUT 处于 pending。
- 分片 PUT 的 URL 指向 `/api/uploads/multipart/...`，Network 面板中没有任何请求直接访问 9000 或 9001。

### 常见错误

- 使用 `file.arrayBuffer()` 读取整个大文件，再自行切数组。正确做法是直接 `file.slice()`。
- 对上万个分片直接 `Promise.all(parts.map(...))`，瞬间创建大量请求。本文始终只有 3 个 worker。
- 401、403、409、422 也自动重试。这里只重试网络错误、408、429 和 5xx。
- 暂停时调用 DELETE，导致恢复时 MinIO UploadId 已被删除。
- 每次恢复都生成新的 `clientUploadId`，结果不能命中原会话。
- 手动设置 `Content-Length`。浏览器不允许，XHR 发送 Blob 时会自动设置。

---

## 第 16 步：端到端验收

### 本步目标

确认上传正确、断点可恢复、越权被拒绝、内存不会随整个文件大小线性增长。

### 文件位置

本步不再新增业务代码，使用前面完成的这些位置做验收：

```text
apps/web/src/pages/upload-demo/index.tsx
apps/web/src/router/index.tsx
apps/server/src/modules/upload/*
docker-compose.yml
```

### 启动位置

全部命令都从模板根目录运行：

```powershell
docker compose up -d postgres redis minio minio-init
pnpm --filter server db:migrate
pnpm --filter server dev
```

另开终端：

```powershell
pnpm --filter web dev
```

先访问 `http://127.0.0.1:13000/api-docs`，使用 `/auth/register` 和 `/auth/login` 准备测试账号，并复制登录响应里的 `accessToken`。再打开 `http://127.0.0.1:9999/upload-demo`，把 Token 粘进联调页。

### 创建测试文件

```powershell
node -e "require('node:fs').writeFileSync('upload-test-25m.bin', Buffer.alloc(25 * 1024 * 1024))"
```

该文件应被切为：

```text
Part 1 = 10,485,760 bytes
Part 2 = 10,485,760 bytes
Part 3 =  5,242,880 bytes
```

### 验证

按下面的必测清单逐项验收，不能只验证“正常上传成功”：

1. 正常上传：最终 MinIO Bucket 中只有一个 25 MiB 对象。
2. 断点续传：上传第一片后暂停；状态只返回第一片；恢复后跳过第一片。
3. 分片覆盖：同一 PartNumber 上传两次，ListParts 中仍只有一个编号。
4. 缺片完成：只传第 1、3 片就 Complete，返回 409。
5. 错误大小：前两片传 10 MiB - 1，返回 422。
6. 越权：另一个账号使用同一会话 ID，返回统一 404。
7. 取消幂等：DELETE 两次都得到 aborted。
8. 完成幂等：Complete 响应成功后再调用一次，仍返回同一完成对象。
9. 浏览器取消：XHR 中断后，NestJS 到 MinIO 的当前请求也停止。
10. 内存观察：上传 1 GiB 文件时，Server RSS 不应随着 1 GiB 文件总大小线性增长；它只应保留网络和 Transform 的有限缓冲。

完成手工验收后，停止开发服务器并运行模板级检查：

```powershell
vp run ready
```

根目录的 `ready` 会执行 `vp check`、各工作区测试和各工作区构建。只有这一整套通过，才能说明教程代码与模板其余部分没有明显集成冲突。

### 查看 MinIO 分片

未完成上传通常不会在普通对象列表中显示为最终对象。可使用 MinIO Console 或 `mc` 查看正在进行的 Multipart。完成后散片被合并为一个对象；取消后散片被清理。

### 删除本地测试文件

验证结束后可删除：

```powershell
Remove-Item -LiteralPath '.\upload-test-25m.bin'
```

这是可重新生成的测试文件，不影响 MinIO 中已经上传的对象。

### 常见错误

- 没有先登录取得 `accessToken`，把 401 当成上传协议错误。
- 修改 `.env.dev` 后没有重启前端，浏览器仍然代理到旧的 10000 端口。
- 暂停后复用已经 aborted 的 `AbortController`，恢复请求立即失败。
- 换了另一个同名文件却只比较文件名；至少同时比较大小、MIME 和 `lastModified`。
- 只看进度 100% 就关闭页面，没有等待 `completing` 进入 `completed`。
- 只测正常上传，没有测越权、缺片、重试、暂停和重复 Complete/DELETE。

---

## 第 17 步：生产反向代理配置

### 本步目标

只代理浏览器到 NestJS 的上传路由，并关闭请求缓冲。MinIO 不对浏览器开放，所以不需要签名 Host 透传和 MinIO CORS。

### 文件位置

实际位置取决于部署仓库，例如：

```text
deploy/nginx/conf.d/api.conf
```

当前模板没有这个文件，下面是部署时应加入的 Nginx 片段：

```nginx
upstream nest_api {
  server server:13000;
}

server {
  listen 443 ssl;
  server_name api.example.com;

  # 当前模板浏览器请求带 /api 前缀；proxy_pass 的 URI 部分会去掉 /api。
  location ^~ /api/uploads/multipart {
    client_max_body_size 12m;
    client_body_timeout 600s;

    proxy_http_version 1.1;
    proxy_request_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_pass http://nest_api/uploads/multipart;
  }
}
```

按当前模板，浏览器请求 `/api/uploads/multipart/abc/parts/1`，NestJS 最终收到 `/uploads/multipart/abc/parts/1`。如果你将来删除 `VITE_API_AFFIX=/api`，必须同时修改这个 location 和 `proxy_pass`，不能只改前端一边。

### 配置解释

- `client_max_body_size 12m`：给 10 MiB 原始分片留少量余量。
- `proxy_http_version 1.1`：保证关闭请求缓冲时可以正常向上游流式发送；某些 Nginx 版本在 HTTP/1.0 上游模式下仍会先缓冲 chunked 请求。
- `proxy_request_buffering off`：Nginx 收到数据就向 NestJS 转发，而不是先写完临时文件。
- 超时要覆盖慢网络上传单片所需时间。
- Host 和查询参数仍应由正常反向代理保留，但本方案没有 MinIO 预签名 URL，所以它们不参与 MinIO 签名验证。
- 本协议要求分片请求具有明确 `Content-Length`。浏览器用 XHR 发送 Blob 时会自动产生；反向代理、WAF 和服务网格不能删除或改写它。

### 必须检查的其他限制

- 云负载均衡请求体上限。
- WAF 请求体上限。
- API Gateway 或 Serverless 单请求上限。
- Ingress Controller 的 body size 和 buffering 配置。

如果平台单请求硬限制只有 4 MiB 或 6 MiB，本教程固定 10 MiB 的后端中转方案不能直接部署；要么换平台，要么重新设计全链路分片协议。不能只改前端常量。

### 验证

先在 Nginx 所在机器或容器中检查语法并重载：

```bash
nginx -t
nginx -s reload
```

再用浏览器联调页上传 25 MiB 文件，在 Network 中确认请求地址仍是 `/api/uploads/multipart/...`，而 NestJS 日志里的路由是 `/uploads/multipart/...`。分片请求应带 `Content-Length: 10485760`，且没有任何浏览器请求直接访问 MinIO 9000/9001。

如需单独确认 body 上限，可向任意不存在的会话发送 13 MiB 测试体：它应在 Nginx 层返回 413；10 MiB 请求则应进入 NestJS，最终得到认证或会话类错误，而不是 Nginx 413。

### 常见错误

- 只把 Nginx 限制从 1 MiB 调大，但没有关闭 request buffering。
- 忘记 `proxy_http_version 1.1`，导致 chunked 请求仍被缓冲。
- 把 `/api/uploads/...` 原样转给 NestJS，导致 Controller 路由多出一层 `/api` 而 404。
- 某一层代理删除 `Content-Length`，后端返回 `UPLOAD.PART_LENGTH_REQUIRED`。
- 把 MinIO 9000/9001 一起代理给公网，扩大攻击面。
- 复制浏览器直传教程的 CORS、预签名 Host 配置到后端中转方案。

---

## 第 18 步：过期清理和生产安全

### 本步目标

前 17 步给出的是“可以跑通并理解完整链路”的教学基线。本步列出真正对公网或多实例上线前必须补齐的工程化能力。没有完成本步时，不要把前面的最小实现描述成已经具备生产级并发安全。

### 文件位置

需要新增或继续修改：

```text
apps/server/src/database/schema.ts
apps/server/src/main.ts
apps/server/src/common/adapters/fastify.adapter.ts
apps/server/src/config/storage.config.ts
apps/server/src/modules/upload/upload.errors.ts
apps/server/src/modules/upload/upload.repository.ts
apps/server/src/modules/upload/upload.service.ts
apps/server/src/modules/upload/upload-cleanup.service.ts
apps/server/src/modules/upload/upload.module.ts
apps/server/test/error-catalog.spec.ts
apps/server/drizzle/*_upload_part_leases.sql
deploy/minio/lifecycle.json（或等价基础设施配置）
deploy/minio/upload-service-policy.json
```

`deploy/*` 当前不在模板中，实际可放进你的部署仓库；这里给的是职责位置，不要求机械创建同名目录。

### 1. 先解决“在途分片”和完成/取消竞态

仅靠 `upload_sessions.status` 不够。一个 PUT 已经读到 `uploading` 并开始向 MinIO 发送后，另一个请求仍可能把会话改成 `completing` 或 `aborting`。因此可能出现：

```text
PUT Part 2 已在途中
  ├─ Complete 先 ListParts，暂时看不到 Part 2
  └─ Abort 先成功，但 Part 2 随后才结束
```

生产实现应在 `apps/server/src/database/schema.ts` 增加 `upload_part_leases` 表，每一个正在处理的分片请求占一条有 TTL 的租约。生成出来的迁移应至少等价于：

```sql
create table upload_part_leases (
  id uuid primary key,
  upload_session_id uuid not null
    references upload_sessions(id) on delete cascade,
  owner_id uuid not null
    references users(id) on delete restrict,
  part_number integer not null
    check (part_number between 1 and 10000),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  unique (upload_session_id, part_number)
);

create index upload_part_leases_session_expires_idx
  on upload_part_leases (upload_session_id, expires_at);

create index upload_part_leases_expires_idx
  on upload_part_leases (expires_at);
```

第一个索引服务 Complete/Abort 按会话检查活动租约，第二个索引服务后台任务全局清除过期租约。两个外键防止租约指向不存在的会话或用户；删除上传会话时只级联删除这些短期租约，不会反向删除用户或 MinIO 对象。`expires_at > created_at` 防止创建一开始就无效的租约。`unique (upload_session_id, part_number)` 阻止同一片被两个请求同时占用；如果确实要允许同 Part 并行竞速，就必须先定义胜者和取消策略，不能直接删除约束。

Repository 和 Service 必须遵守下面顺序：

1. `beginPartLease` 在短事务中取得“按 uploadSessionId 计算的 PostgreSQL advisory transaction lock”。
2. 在同一事务里重新检查会话仍为 `uploading` 且未过期，然后插入租约；事务马上提交，不能拿着数据库事务传 10 MiB 流。
3. 分片上传期间每 30 秒续租，例如把 `expiresAt` 延长到当前时间后 2 分钟；续租 UPDATE 必须按 `leaseId + uploadSessionId` 条件更新，并检查受影响行数。租约已过期、被清理或 UPDATE 返回 0 行都算续租失败。请求结束时在 `finally` 删除租约。**任何一次续租失败都必须立刻触发该 PUT 的 `AbortController.abort()`**，不能让失去有效租约的请求继续写 MinIO。
4. `claimCompleting` 和 `claimAborting` 也先取得同一把 advisory lock，在同一短事务内清除过期租约并检查有效租约。若仍有租约，抛出 `UPLOAD_ERRORS.PARTS_STILL_ACTIVE`（409），并保持原来的 `uploading` 状态；第 9 步已经把该错误加入 `apps/server/src/modules/upload/upload.errors.ts` 和统一错误目录测试。不能先改成 `completing/aborting` 再把调用方卡住。
5. 没有有效租约时，事务内再把状态改成 `completing/aborting`。状态一旦“封口”，新的 `beginPartLease` 就不能插入。
6. 前端先停止并等待所有 PUT 结束，再调用 Complete 或 DELETE。联调页的“取消并释放”已经按这个顺序演示。
7. 状态封口且租约归零后才执行 MinIO Complete/Abort。此时没有在途 Part，一次成功的 Abort 才能可靠地释放该 UploadId；控制命令的临时失败由清理任务重试。
8. 如果 Complete 已发出但结果不确定，会话会保持 `completing`。后续重试或清理任务必须在同一 advisory lock 下先 HeadObject；对象存在则补写 `completed`，对象不存在、没有有效租约且 UploadId 仍存在时，才重新 ListParts/Complete。不能永远只返回 `INVALID_STATE`，也不能直接改回 `uploading`。

advisory lock 只保护“登记租约/封口”这几个很短的事务；不要在整个 10 MiB 上传期间持有数据库锁或长事务，否则并发稍高就会耗尽连接池。

### 2. 实现应用层过期清理

`upload-cleanup.service.ts` 应由独立定时任务触发，批量领取：

```text
status in (uploading, aborting, expired, completing)
expiresAt <= now，或 updatedAt 长时间没有变化
```

不要把 `FOR UPDATE SKIP LOCKED` 的数据库事务一直保持到 MinIO 请求结束。应在 `upload_sessions` 增加等价的任务租约字段：

```text
cleanupClaimId     uuid nullable
cleanupLeaseUntil  timestamptz nullable
nextCleanupAt      timestamptz nullable
lastCleanupError   text nullable
```

并为待清理状态的 `status + nextCleanupAt` 建索引。一次领取的正确边界是：

1. 在短事务内用 `FOR UPDATE SKIP LOCKED` 选出一小批候选行。
2. 为每行写入新的 `cleanupClaimId` 和几分钟后的 `cleanupLeaseUntil`，然后立即提交事务。
3. 事务外调用 MinIO Head/List/Complete/Abort，不占用数据库连接和行锁。
4. 成功或失败后，只有 `cleanupClaimId` 仍等于本 Worker Token 的 UPDATE 才能修改状态；失败时记录错误、设置指数退避后的 `nextCleanupAt` 并释放 Claim。
5. Worker 崩溃后，只有 `cleanupLeaseUntil <= now()` 的任务才能被另一个实例重新领取。

如果只在事务里 SELECT 后立刻提交、却没有持久化 Claim 租约，多实例仍会同时对同一 UploadId 调用 Complete/Abort；如果拿着行锁等待 MinIO，又会制造长事务。这两种实现都不合格。

推荐处理逻辑：

- 使用 PostgreSQL `FOR UPDATE SKIP LOCKED` 分批领取，避免多个实例处理同一会话。
- 使用第 5 步已增加的 `status + expiresAt`、`status + updatedAt` 索引做全局扫描；以 `ownerId` 开头的索引不能有效支撑这一查询。
- 先删除已经过期的活动租约。
- `uploading/expired/aborting`：确认没有有效租约后调用 Abort，成功后标记 `aborted` 或 `expired`。
- `completing`：先 `HeadObject`。对象已存在则补写 `completed`；对象不存在、没有有效租约且 UploadId 仍存在时，在同一会话锁下重试 ListParts/Complete 或按业务策略 Abort；不能直接改回 `uploading`。
- 单批限制数量并记录日志、指标和最后错误，避免一次扫描拖垮 MinIO。
- 用户硬删除前必须先取消未完成 Multipart，并按业务保留或删除最终对象；不要把 `upload_sessions` 级联删除后再尝试寻找已经丢失的 UploadId/ObjectKey。基线表使用 `onDelete: 'restrict'` 正是为了阻止这种顺序错误。

不要在 GET、PUT、Complete 等用户请求里顺手扫描全表。清理必须是独立后台任务；如果不想在 NestJS 进程内调度，也可以由 Kubernetes CronJob 或任务系统调用同一 Service。

### 3. 配置 MinIO 生命周期兜底

在 Bucket `uploads` 上增加等价规则：

```json
{
  "Rules": [
    {
      "ID": "abort-incomplete-multipart-after-7-days",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 7
      }
    }
  ]
}
```

上面是可作为 `deploy/minio/lifecycle.json` 使用的完整规则集合结构，而不是孤立的 Rule 片段。应用会话是 24 小时，MinIO 兜底设为 7 天，给应用补偿和排障留时间。通过 MinIO Console、`mc ilm` 或基础设施代码写入时，先读取并合并 Bucket 已有生命周期配置，不能用一个新规则覆盖其他保留策略。

生命周期只是最后保险，不能替代应用主动 Abort，也不能替代在途租约。

### 4. 使用最小权限服务账号

生产环境不要使用 `MINIO_ROOT_USER`。部署仓库中新建：

```text
deploy/minio/upload-service-policy.json
```

完整内容：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BucketProbe",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::uploads"]
    },
    {
      "Sid": "MultipartUploadOnly",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": ["arn:aws:s3:::uploads/users/*"]
    }
  ]
}
```

权限含义：

- `s3:PutObject` 覆盖 Create、UploadPart 和 Complete。
- `s3:ListMultipartUploadParts` 只列出某个已知 UploadId 的 Parts。
- `s3:AbortMultipartUpload` 释放未完成分片。
- `s3:GetObject` 是 HeadObject 所需权限，用来恢复 Complete 状态。
- `s3:ListBucket` 是启动时 HeadBucket 探针所需桶级权限。
- 没有授予 `DeleteObject`、Bucket 策略、生命周期或管理员权限。

本教程的清理任务从数据库取得已知 UploadId，所以默认不需要 `s3:ListBucketMultipartUploads`。只有另做“扫描整个 Bucket 的孤儿 Multipart 对账任务”时才把它加到桶级 Statement。生命周期规则更建议由部署账号配置，不要扩大应用运行时账号权限。

使用与 MinIO Server 一起经过验证并固定版本的 `mc`，由部署管理员执行：

```powershell
mc --version
mc alias set prod-minio https://minio.internal.example.com $env:MINIO_ADMIN_USER $env:MINIO_ADMIN_PASSWORD
mc admin policy create prod-minio upload-service deploy/minio/upload-service-policy.json
mc admin user add prod-minio upload-app $env:UPLOAD_SERVICE_SECRET
mc admin policy attach prod-minio upload-service --user upload-app
mc admin user info prod-minio upload-app
```

`MINIO_ADMIN_PASSWORD` 和 `UPLOAD_SERVICE_SECRET` 应由部署平台的 Secret 注入，不要写进仓库或命令脚本。不同固定版本的 `mc` 若命令名有变化，以该版本 `mc admin policy --help` 为准，并把实际命令固化到基础设施代码中。

NestJS 使用 `upload-app` 的 Access Key 和 Secret，不再使用 Root。随后用这组运行时凭证做一次 HeadBucket、初始化、上传、Complete、Abort 验收，并验证它不能改 Bucket 策略、生命周期或删除最终对象。

Bucket 保持私有。浏览器下载文件时，由后端做权限校验后中转下载，或单独生成短时下载签名；下载方式与本教程的上传中转可以独立选择。

### 5. 加密 NestJS 到 MinIO 的链路并管理 Secret

浏览器使用 HTTPS 只保护“浏览器 → NestJS”。后端中转还存在“`NestJS → MinIO`”这一段，生产配置位置通常是部署 Secret/环境变量：

```dotenv
STORAGE_ENDPOINT=https://minio.internal.example.com
STORAGE_ACCESS_KEY_ID=upload-app
STORAGE_SECRET_ACCESS_KEY=<由 Secret 注入>
```

生产优先使用 `https://` 并校验证书。内部 CA 应加入容器或 Node.js 信任链，例如由平台挂载 CA 文件并设置 `NODE_EXTRA_CA_CERTS`；不要用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 绕过验证。只有隔离且受控的私网，或 Service Mesh 已经为这段链路提供经过验证的 mTLS 时，才可以经过安全评审继续使用 `http://`。

MinIO Access Key、Secret、内部 CA 和管理员凭证都放在 Secret Manager、Kubernetes Secret 或等价设施中，定期轮换。它们永远不能进入 `apps/web/.env*`，因为任何 `VITE_` 变量都会打包进浏览器代码。

### 6. 限流、可信代理、CORS 和内容安全

前端并发 3 只是体验设置，恶意客户端可以绕过。后端或网关还应限制单用户会话数、单用户活动分片数、单 IP 速率和全局到 MinIO 的并发。多实例计数器或信号量必须有 TTL。

如果限流读取客户端 IP，`apps/server/src/common/adapters/fastify.adapter.ts` 只能信任明确的反向代理 IP/CIDR 或固定跳数，不能设置全局 `trustProxy: true`。同时让最外层代理覆盖客户端自己传入的 `X-Forwarded-For`、`X-Forwarded-Proto`，并阻止绕过网关直接访问 NestJS。

后端中转只是不需要 **MinIO CORS**。如果浏览器跨域访问 NestJS，生产环境应把 `apps/server/src/main.ts` 改成明确的前端域名，例如：

```ts
app.enableCors({
  origin: ['https://web.example.com'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
})
```

这里实际配置字段是 `methods`，不是 `allowedMethods`。如果前后端通过同一站点的 `/api` 反代访问，则通常不发生浏览器跨域，但仍应保留边界检查和认证。

`contentType`、扩展名和客户端哈希都不可信。未知文件下载使用 `Content-Disposition: attachment` 和 `X-Content-Type-Options: nosniff`；有合规要求时先上传到隔离前缀，扫描通过后再发布。Multipart ETag 不是全文件 MD5。

### 验证

上线前至少增加并通过以下自动化测试：

1. 一个 PUT 尚未结束时调用 Complete，Complete 不得先合并，也不能漏掉该 Part。
2. 一个 PUT 尚未结束时调用 DELETE，先停止 PUT；租约归零后 Abort，最终 `ListParts` 得到 `NoSuchUpload`。
3. 模拟进程在上传中崩溃，租约过期后清理任务可以回收会话。
4. 模拟 MinIO Complete 成功、数据库更新失败，清理任务通过 HeadObject 恢复为 completed。
5. 两个 Server 实例同时跑清理，只能有一个实例领取同一会话。
6. 检查 Bucket 生命周期规则确实包含 7 天未完成 Multipart 清理，并且没有覆盖已有规则。
7. 从允许的前端 Origin 发起 `OPTIONS` 预检，应返回允许的 Origin、Headers 和 Methods；从未允许的 Origin 发起预检，不能得到跨域授权。
8. 使用运行时 MinIO 账号完成上传，但修改生命周期、Bucket 策略和删除对象都应被拒绝。
9. 抓取 NestJS 到 MinIO 的连接，确认生产链路使用有效 TLS；内部 CA 失效时应用应启动失败，而不是静默跳过证书验证。
10. 伪造 `X-Forwarded-For` 直连 NestJS 不得改变限流看到的客户端身份。

### 常见错误

- 只把状态改成 `aborting`，却不等待已经开始的 PUT，随后调用一次 Abort 就标记 `aborted`。
- 用进程内 Map 统计活动分片，却部署多个 NestJS 实例；另一个实例的在途请求完全不可见。
- 用数据库计数器但没有租约 TTL；进程崩溃后计数永远无法归零。
- 为了同步而持有长事务直到 10 MiB 上传结束，最终耗尽数据库连接。
- 把 MinIO 生命周期当主动清理，允许垃圾分片占用 7 天空间。
- 生产继续使用 Root 账号、明文跨不可信网络访问 MinIO、`trustProxy: true` 或 `origin: ['*']`。

---

## 故障排查表

| 现象                     | 最可能原因                              | 优先检查位置                             | 处理                                                  |
| ------------------------ | --------------------------------------- | ---------------------------------------- | ----------------------------------------------------- |
| 401                      | 没传 Session Token                      | 前端 `Authorization`、现有 Session Guard | 传 `Bearer <token>`，不要给 Controller 加 `@Public()` |
| 413                      | Nginx/Ingress/平台限制小于 10 MiB       | 网关配置                                 | 调整到 12 MiB 左右，并检查云平台硬限制                |
| 415                      | 没注册原始流解析器或 Content-Type 错误  | `fastify.adapter.ts`                     | 注册 `application/octet-stream`，XHR 设置正确类型     |
| 411                      | 请求没有有效 Content-Length             | 代理、非浏览器客户端                     | 浏览器直接发送 Blob；检查代理是否移除该头             |
| 422 PART_SIZE_MISMATCH   | 切片下标错或数据中途断开                | 前端 `file.slice`、ExactSizeTransform    | 非末片严格 10 MiB，PartNumber 从 1 开始               |
| 409 PARTS_INCOMPLETE     | 缺片、片大小错误或上传尚未结束          | `ListParts` 结果                         | 等全部 worker 完成，再调用 Complete                   |
| 409 PARTS_STILL_ACTIVE   | 仍有 PUT 持有有效分片租约               | `upload_part_leases`、前端 worker        | 先停止并等待 PUT；租约归零后重试 Complete/DELETE      |
| `NoSuchUpload`           | 会话过期、已 Abort、UploadId/Key 不匹配 | 数据库会话和 MinIO                       | 返回 410，重新初始化；不要把 MinIO UploadId 交前端    |
| `EntityTooSmall`         | 中间片小于 S3 最小值                    | 前端切片和后端校验                       | 本协议中间片固定 10 MiB                               |
| `InvalidPartOrder`       | Complete Parts 未排序                   | MinIO Adapter                            | 按 PartNumber 升序传给 Complete                       |
| 503                      | MinIO 不可达、凭证错、Bucket 不存在     | Storage env、Compose 日志                | 区分宿主机 `127.0.0.1` 和 Compose `minio`             |
| 后端 200，前端却报失败   | Alova 按包装响应解析                    | `multipart-upload.ts`                    | 使用 `isWrapped: false`                               |
| 前端一直连 10000         | 开发代理和 Server 端口不一致            | `apps/web/.env.dev`                      | 改成 13000 并重启前端                                 |
| 内存明显随文件总大小上涨 | 使用 Buffer、临时聚合或无限并发         | Fastify parser、Controller、前端 worker  | 保持 Readable 流，去掉 `toBuffer()`，并发限制为 3     |
| 暂停后无法恢复           | 暂停时 DELETE 或 clientUploadId 变了    | 前端暂停逻辑                             | 暂停只 Abort XHR，恢复复用原 clientUploadId           |
| 超过 1000 片后完成失败   | ListParts 未分页                        | `minio-storage.adapter.ts`               | 循环处理 marker 和 IsTruncated                        |

---

## 最终文件清单

完成教程后，应新增：

```text
apps/server/src/config/storage.config.ts
apps/server/src/modules/upload/upload.constants.ts
apps/server/src/modules/upload/upload.errors.ts
apps/server/src/modules/upload/upload.repository.ts
apps/server/src/modules/upload/upload.service.ts
apps/server/src/modules/upload/upload.controller.ts
apps/server/src/modules/upload/upload.module.ts
apps/server/src/modules/upload/dto/initiate-multipart-upload.dto.ts
apps/server/src/modules/upload/dto/upload-params.dto.ts
apps/server/src/modules/upload/storage/storage.port.ts
apps/server/src/modules/upload/storage/minio-storage.adapter.ts
apps/server/src/modules/upload/storage/exact-size.transform.ts
apps/server/src/modules/upload/utils/object-key.ts
apps/server/test/upload-constants.spec.ts
apps/server/test/upload-stream.spec.ts
apps/web/src/services/multipart-upload.ts
apps/web/src/utils/file-upload/multipart-uploader.ts
apps/web/src/pages/upload-demo/index.tsx
```

应修改：

```text
docker-compose.yml
pnpm-workspace.yaml
apps/server/package.json
apps/server/.env.development.local
apps/server/.gitignore
apps/server/src/config/index.ts
apps/server/src/common/adapters/fastify.adapter.ts
apps/server/src/database/schema.ts
apps/server/src/app.module.ts
apps/server/test/error-catalog.spec.ts
apps/web/.env.dev
apps/web/src/router/index.tsx
```

对公网或多实例上线时，第 18 步还要求增加活动分片租约、清理任务和部署侧 MinIO 策略文件；它们属于生产加固，不要与上面的教学基线文件清单混为一谈。

## 上线前最终检查

- [ ] 每片固定 10 MiB，只有最后一片允许更小。
- [ ] PartNumber 从 1 开始。
- [ ] 前端默认并发 3，最多 5。
- [ ] 分片请求体是 Blob，不是整个文件 ArrayBuffer。
- [ ] Fastify 直接返回 Readable，不转 Buffer、不落临时文件。
- [ ] 同时校验 Content-Length 和真实流字节数。
- [ ] 所有数据库查询包含 ownerId。
- [ ] Bucket、Object Key、MinIO UploadId 都由后端控制。
- [ ] Complete 使用分页 ListParts，并校验连续编号、大小和总字节数。
- [ ] Complete 和 Abort 都具备状态条件与幂等行为。
- [ ] MinIO 不需要公网地址或 MinIO CORS；如 API 跨域，已正确配置 NestJS/API CORS。
- [ ] 9000/9001 不暴露公网，本地 Compose 只绑定 127.0.0.1。
- [ ] Nginx 允许 10 MiB 请求，使用 HTTP/1.1，关闭 request buffering，并保留 Content-Length。
- [ ] 生产 MinIO 使用固定版本和最小权限服务账号。
- [ ] NestJS 到 MinIO 使用经过验证的 TLS（或经安全评审的等价 mTLS），凭证只从 Secret 注入。
- [ ] `trustProxy` 只信任真实代理 IP/CIDR/跳数，且不能绕过网关直连 NestJS。
- [ ] 对公网/多实例部署已实现活动分片租约，Complete/Abort 会先封口并等待租约归零。
- [ ] 应用有过期清理，Bucket 有未完成 Multipart 生命周期兜底。
- [ ] Multipart ETag 没有被当作整个文件 MD5。
- [ ] `vp run ready`、数据库迁移和 25 MiB 三片验收全部通过。

完成并验证第 1～17 步后，模板才会具备“浏览器 10 MiB 分片 → NestJS 流式中转 → MinIO Multipart → 断点续传”的教学基础方案；当前仓库只是写入了这份教程，并没有自动实施教程里的业务代码。完成第 18 步的竞态、清理和权限加固后，才适合对公网或多实例上线。后端仍承担双向带宽，容量规划必须按“用户上传流量约两次经过 Server 网络栈”计算。
