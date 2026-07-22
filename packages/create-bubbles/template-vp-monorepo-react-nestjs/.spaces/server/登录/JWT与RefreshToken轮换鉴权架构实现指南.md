# 从零实现 JWT + Refresh Token 轮换：逐步施工教程

这不是一份架构讨论稿，而是一份可以按顺序施工的教程。

你每完成一步，都要先执行该步的构建或接口验收。没有通过时不要继续下一步，否则后面出现问题时很难判断是数据库、Cookie、JWT、Guard 还是 Redis 导致的。

本教程只告诉你如何修改项目。Codex 不会替你修改 apps/server，也不会替你安装依赖、执行迁移或启动服务。

## 最终要得到什么

完成步骤 0～15 后，请求会按下面的方式工作。附录 A、B 是后续生产化参考，不属于本教程的强制施工步骤：

~~~mermaid
flowchart LR
  A["浏览器"] --> B["登录或刷新"]
  B --> C["短期 Access JWT"]
  B --> D["HttpOnly Refresh Cookie"]
  C --> E["全局 HybridAuthGuard"]
  E --> F{"接口类型"}
  F -->|"Public"| G["不鉴权"]
  F -->|"bounded，默认"| H["最多缓存 30 秒的 Auth State"]
  F -->|"strong"| I["每次读取 Redis Auth State"]
  H --> J["JWT 版本与 Auth State 比较"]
  I --> J
  J --> K["业务 Controller"]
~~~

最终具备以下能力：

- Access Token 是有效期 10 分钟的 JWT。
- Refresh Token 是随机不透明字符串，只放 HttpOnly Cookie。
- 每次刷新都消费旧 Refresh Token，并签发一个新的 Refresh Token。
- 重复使用已消费的 Refresh Token 会撤销整个登录 Session。
- 在撤销状态已经成功投影到 Redis、Redis 可用且没有 Outbox 恢复积压时，普通接口漏掉 Push 后通常在一个 30 秒 L1 TTL 加少量网络/调度抖动内收敛。
- 改密、付款、授权变更等接口使用 StrongAuth，每次实时查询 Redis。
- Public 装饰器明确声明登录、注册、刷新等公开接口。
- 改密和退出全部设备只增加一次 accountAuthEpoch，不逐个广播每个 Session。
- 单设备退出或踢人只增加该 Session 的 sessionVersion。
- Redis Pub/Sub 只负责把本地缓存标脏，真正的数据在请求到来时再 Pull。
- Pub/Sub 丢消息时，L1 TTL 仍保证普通接口最终收敛。

## 先记住三个不同的版本

不要只设计一个 version。

| 字段 | 什么时候增加 | 影响范围 |
| --- | --- | --- |
| accountAuthEpoch | 修改密码、冻结账号、退出全部设备 | 该账号的全部旧 Access JWT 和 Refresh Family |
| sessionVersion | 当前设备退出、管理员踢某个设备、Refresh 重放 | 仅一个登录 Session |
| refreshGeneration | 每次成功刷新 | 仅 Refresh Token 轮换链 |

Refresh Token 正常轮换时，只增加 refreshGeneration，不增加前两个版本。

Access JWT 的载荷使用：

~~~json
{
  "sub": "123",
  "sid": "session-uuid",
  "ae": 17,
  "sv": 3,
  "jti": "jwt-uuid",
  "iss": "bubbles-auth",
  "aud": "bubbles-api",
  "iat": 1,
  "exp": 2
}
~~~

版本比较不是简单的不相等：

- 共享状态版本大于 JWT 版本：JWT 已被撤销，返回 401。
- 共享状态版本等于 JWT 版本：继续检查账号、Session 状态和过期时间。
- 共享状态版本小于 JWT 版本：共享投影可能落后，回源 PostgreSQL 修复；修复后仍落后则返回 503，不能误报 401，也不能放行。

## 阅读和提交顺序

- 步骤 0～10：先完成全部接口强校验的登录、轮换、踢人和改密闭环。
- 步骤 11～12：加入 L1 与 Push/Pull，达到本教程的目标架构。
- 步骤 13～15：加入 Outbox、测试入口和旧数据约束收口。
- 附录 A：拆成微服务后的非对称签名迁移路线，本教程不实施。
- 附录 B：生产上线前的安全清单。

## 施工规则

下面所有命令都从仓库根目录执行：

~~~text
C:\malei\stu\bubbles\packages\create-bubbles\template-vp-monorepo-react-nestjs
~~~

项目真实技术栈是 NestJS 11、Fastify、Drizzle、PostgreSQL、ioredis 和 Vite+。

因此必须遵守：

- 使用 vp，不把教程改写成 npm 或 pnpm 工作流。
- Fastify Cookie 使用 @fastify/cookie，不使用 Express 的 res.cookie。
- 代码使用单引号、无分号和 @/* 路径别名。
- Swagger 的 addBearerAuth 只是文档声明，真正鉴权来自 APP_GUARD。
- 现有 Bypass 装饰器只控制 ResponseInterceptor，不能代替 Public。
- Refresh Token 原文不能进入数据库、日志和异常。
- Authorization 完整请求头不能写日志。

## 最终目录

施工完成后，Auth 相关目录大致如下：

~~~text
apps/server/src/
├─ common/
│  ├─ constants/
│  │  └─ auth.ts
│  └─ decorators/
│     ├─ public.decorator.ts
│     ├─ strong-auth.decorator.ts
│     └─ current-auth.decorator.ts
├─ config/
│  └─ auth.config.ts
├─ database/
│  └─ schema.ts
└─ modules/
   └─ auth/
      ├─ dto/
      │  ├─ register.dto.ts
      │  ├─ login.dto.ts
      │  └─ change-password.dto.ts
      ├─ guards/
      │  └─ hybrid-auth.guard.ts
      ├─ http/
      │  └─ refresh-cookie.ts
      ├─ state/
      │  ├─ auth-state.service.ts
      │  ├─ auth-state.events.ts
      │  ├─ auth-state.publisher.ts
      │  ├─ auth-state.subscriber.ts
      │  └─ auth-outbox.worker.ts
      ├─ auth.constants.ts
      ├─ auth.types.ts
      ├─ auth.repository.ts
      ├─ password.service.ts
      ├─ token.service.ts
      ├─ auth.service.ts
      ├─ auth.controller.ts
      └─ auth.module.ts
~~~

# 步骤 0：先确认原项目能正常构建

## 本步目标

证明后续错误不是项目原本就存在的。

## 执行命令

~~~powershell
git status --short
vp install
vp run "server#build"
~~~

如果 vp 本身表现异常，再执行：

~~~powershell
vp env doctor
~~~

## 完成检查点

- vp install 成功。
- server 原始构建成功。
- 记住 git status 中原本就存在的用户修改，不要覆盖它们。

如果基线构建失败，先修复基线，不要继续。

# 步骤 1：安装第一阶段依赖

## 本步目标

安装 JWT、Fastify、Fastify Cookie 和 Argon2id。L1 缓存依赖先不装，等强校验闭环跑通以后再装。

## 执行命令

~~~powershell
vp add @nestjs/jwt @fastify/cookie fastify@5.8.5 argon2 --filter server --save-catalog --allow-build argon2
~~~

## 检查文件

打开 apps/server/package.json，确认 dependencies 中出现：

~~~json
{
  "@fastify/cookie": "catalog:",
  "@nestjs/jwt": "catalog:",
  "argon2": "catalog:",
  "fastify": "catalog:"
}
~~~

同时确认 pnpm-workspace.yaml 的 catalog 中出现对应版本。

这里把 fastify 声明为 server 的直接依赖，是因为后续源码会直接从 fastify 导入 FastifyRequest 和 FastifyReply 类型。pnpm 严格依赖模式下，不应依赖 @nestjs/platform-fastify 偶然带来的传递依赖。5.8.5 与当前模板中适配器实际使用的 Fastify 版本一致。

## 为什么不是 bcrypt

本教程使用 Argon2id 存密码。Refresh Token 本身是 32 字节随机值，不使用 Argon2，而使用带服务端 pepper 的 HMAC-SHA256，以便数据库可以建立唯一索引并快速查找。

## 验收命令

~~~powershell
vp run "server#build"
~~~

## 完成检查点

- 四个依赖已加入 server。
- 构建仍然成功。

# 步骤 2：新增 Auth 配置和本地密钥

## 本步目标

把 JWT、Refresh Token、Cookie 和本地缓存参数放入独立配置，并确保真实密钥不提交到 Git。

当前 apps/server/.env.development 和 .env.production 是已跟踪文件。真实密钥不要写进去，应写到已被 .gitignore 忽略的 .env.development.local 或 Secret Manager。

## 2.1 新增配置文件

新增文件：

~~~text
apps/server/src/config/auth.config.ts
~~~

粘贴完整代码：

~~~ts
import { registerAs } from '@nestjs/config'

export interface AuthConfig {
  accessSecret: string
  issuer: string
  audience: string
  accessTtlSeconds: number
  refreshTtlSeconds: number
  refreshPepper: string
  clockToleranceSeconds: number
  localCacheTtlMs: number
  tombstoneTtlSeconds: number
  cookieName: string
  cookiePath: string
  cookieSecure: boolean
  cookieDomain?: string
  eventChannel: string
}

function requireSecret(name: string) {
  const value = process.env[name]?.trim()

  if (!value || value.length < 32) {
    throw new Error(name + ' 必须配置，并且至少 32 个字符')
  }

  return value
}

function positiveInt(name: string, fallback: number) {
  const raw = process.env[name]

  if (!raw) {
    return fallback
  }

  const value = Number.parseInt(raw, 10)

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(name + ' 必须是正整数')
  }

  return value
}

export default registerAs(
  'auth',
  (): AuthConfig => ({
    accessSecret: requireSecret('JWT_ACCESS_SECRET'),
    issuer: process.env.JWT_ISSUER ?? 'bubbles-auth',
    audience: process.env.JWT_AUDIENCE ?? 'bubbles-api',
    accessTtlSeconds: positiveInt('JWT_ACCESS_TTL_SECONDS', 10 * 60),
    refreshTtlSeconds: positiveInt('REFRESH_TOKEN_TTL_SECONDS', 30 * 24 * 60 * 60),
    refreshPepper: requireSecret('REFRESH_TOKEN_PEPPER'),
    clockToleranceSeconds: positiveInt('JWT_CLOCK_TOLERANCE_SECONDS', 30),
    localCacheTtlMs: positiveInt('AUTH_LOCAL_CACHE_TTL_MS', 30_000),
    tombstoneTtlSeconds: positiveInt('AUTH_TOMBSTONE_TTL_SECONDS', 15 * 60),
    cookieName: process.env.REFRESH_COOKIE_NAME ?? 'refresh_token',
    cookiePath: process.env.REFRESH_COOKIE_PATH ?? '/auth',
    cookieSecure:
      process.env.REFRESH_COOKIE_SECURE === 'true' ||
      process.env.NODE_ENV === 'production',
    cookieDomain: process.env.REFRESH_COOKIE_DOMAIN || undefined,
    eventChannel: process.env.AUTH_EVENT_CHANNEL ?? 'auth-state:invalidate',
  }),
)
~~~

这里的 15 分钟 tombstone 大于：

~~~text
10 分钟 Access JWT
+ 30 秒 L1 陈旧窗口
+ 30 秒时钟误差
~~~

## 2.2 导出 authConfig

修改文件：

~~~text
apps/server/src/config/index.ts
~~~

替换成：

~~~ts
export { default as appConfig } from './app.config'
export { default as authConfig } from './auth.config'
export { default as databaseConfig } from './database.config'
export { default as llmConfig } from './llm.config'
export { default as redisConfig } from './redis.config'
~~~

## 2.3 删除旧的 JWT_SECRET 配置入口

修改文件：

~~~text
apps/server/src/config/app.config.ts
~~~

替换成：

~~~ts
import { registerAs } from '@nestjs/config'

export default registerAs('app', () => ({
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  env: process.env.NODE_ENV ?? 'development',
}))
~~~

以后只使用 JWT_ACCESS_SECRET，不再同时维护 JWT_SECRET 和 JWT_ACCESS_SECRET 两套名字。

## 2.4 让 ConfigModule 优先加载 local 文件

打开：

~~~text
apps/server/src/app.module.ts
~~~

把 config import 改成：

~~~ts
import { appConfig, authConfig, databaseConfig, llmConfig, redisConfig } from '@/config'
~~~

把 ConfigModule.forRoot 中的 envFilePath 和 load 改成：

~~~ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [
    '.env.' + nodeEnv + '.local',
    '.env.local',
    '.env.' + nodeEnv,
    '.env',
  ],
  load: [appConfig, authConfig, databaseConfig, llmConfig, redisConfig],
})
~~~

local 文件排在前面。dotenv 在不启用 override 时保留先读到的值，因此真实本地密钥会优先生效。

## 2.5 创建本地环境文件

先生成两个不同的随机值：

~~~powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
~~~

新增文件：

~~~text
apps/server/.env.development.local
~~~

写入下面内容，把两个占位值替换成刚生成的两个不同随机值：

~~~dotenv
JWT_ACCESS_SECRET=替换成第一个随机值
REFRESH_TOKEN_PEPPER=替换成第二个随机值
JWT_ISSUER=bubbles-auth
JWT_AUDIENCE=bubbles-api
JWT_ACCESS_TTL_SECONDS=600
JWT_CLOCK_TOLERANCE_SECONDS=30

REFRESH_TOKEN_TTL_SECONDS=2592000
REFRESH_COOKIE_NAME=refresh_token
REFRESH_COOKIE_PATH=/auth
REFRESH_COOKIE_SECURE=false

AUTH_LOCAL_CACHE_TTL_MS=30000
AUTH_TOMBSTONE_TTL_SECONDS=900
AUTH_EVENT_CHANNEL=auth-state:invalidate
~~~

注意：生产 HTTPS 可以使用 __Host-refresh_token，但 __Host- 前缀不能设置 Domain，Path 必须是 /。本教程开发阶段使用 refresh_token 和 /auth，避免浏览器因前缀规则拒收 Cookie。

## 验收命令

~~~powershell
vp run "server#build"
~~~

如果启动时报 JWT_ACCESS_SECRET 未配置，说明 local 文件没有按上述路径创建，或 ConfigModule 的 envFilePath 没改对。

## 完成检查点

- 真实密钥只存在 .env.development.local。
- git status 不显示 .env.development.local。
- 项目中不再读取 JWT_SECRET。
- 构建成功。

# 步骤 3：给 Fastify 注册 Cookie 插件

## 本步目标

让登录和刷新接口可以安全设置、读取 HttpOnly Refresh Cookie。

## 修改文件

~~~text
apps/server/src/main.ts
~~~

替换为下面的完整内容：

~~~ts
import fastifyCookie from '@fastify/cookie'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '@/app.module'
import { logNetworkUrls } from '@/utils/server-address'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  )

  await app.register(fastifyCookie)

  const config = new DocumentBuilder()
    .setTitle('前后端模板 API')
    .setDescription('接口文档')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build()

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config))

  SwaggerModule.setup('api-docs', app, document)

  const port = Number.parseInt(process.env.PORT ?? '3000', 10)
  const host = process.env.HOST ?? '0.0.0.0'

  await app.listen(port, host)
  logNetworkUrls(port)
}

void bootstrap()
~~~

不要写 Express 风格的 res.cookie。后续 Controller 会使用 FastifyReply.setCookie。

Swagger 的 addBearerAuth 只定义了文档里的认证方案：

- 它不会验证 JWT。
- 它不会自动保护接口。
- 它也不会自动给所有接口显示锁图标。
- 运行时保护来自后面注册的全局 APP_GUARD。

## 验收命令

~~~powershell
vp run "server#build"
~~~

## 完成检查点

- @fastify/cookie 已在创建 Swagger 文档和 listen 之前注册。
- main.ts 没有 Express Response 类型。
- 构建成功。

# 步骤 4：扩展数据库模型并生成迁移

## 本步目标

增加密码、账号认证版本、登录 Session、Refresh Family、Refresh Token 和 Outbox 表。

本步骤故意先让 passwordHash 可空，因为当前 users 表可能已经有数据。已有数据还没有密码哈希，直接新增 NOT NULL 会让迁移失败。等所有旧账号完成密码回填后，再在最后一步改成 notNull。

## 4.1 替换 Drizzle Schema

修改文件：

~~~text
apps/server/src/database/schema.ts
~~~

替换为下面的完整内容：

~~~ts
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const userStatusEnum = pgEnum('user_status', [
  'active',
  'locked',
  'disabled',
])

export const authSessionStatusEnum = pgEnum('auth_session_status', [
  'active',
  'revoked',
])

export const refreshFamilyStatusEnum = pgEnum('refresh_family_status', [
  'active',
  'revoked',
  'compromised',
])

export const refreshTokenStatusEnum = pgEnum('refresh_token_status', [
  'active',
  'consumed',
  'revoked',
])

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),

  // 第一阶段先允许 null，旧账号完成密码回填后再改成 notNull
  passwordHash: varchar('password_hash', { length: 255 }),

  status: userStatusEnum('status').default('active').notNull(),
  authEpoch: integer('auth_epoch').default(1).notNull(),
  passwordChangedAt: timestamp('password_changed_at', {
    withTimezone: true,
  }),

  // 保留原项目已有列名 create_at，避免无意重命名旧列
  createdAt: timestamp('create_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    version: integer('version').default(1).notNull(),
    status: authSessionStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: varchar('revoke_reason', { length: 100 }),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('auth_sessions_user_id_idx').on(table.userId),
    index('auth_sessions_user_status_idx').on(table.userId, table.status),
  ],
)

export const refreshTokenFamilies = pgTable(
  'refresh_token_families',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => authSessions.id, { onDelete: 'restrict' }),
    status: refreshFamilyStatusEnum('status').default('active').notNull(),
    accountEpochAtCreate: integer('account_epoch_at_create').notNull(),
    currentGeneration: integer('current_generation').default(1).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: varchar('revoke_reason', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('refresh_families_session_id_uidx').on(table.sessionId),
    index('refresh_families_status_idx').on(table.status),
  ],
)

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => refreshTokenFamilies.id, { onDelete: 'restrict' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    generation: integer('generation').notNull(),
    status: refreshTokenStatusEnum('status').default('active').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_token_hash_uidx').on(table.tokenHash),
    uniqueIndex('refresh_tokens_family_generation_uidx').on(
      table.familyId,
      table.generation,
    ),
    index('refresh_tokens_family_status_idx').on(table.familyId, table.status),
  ],
)

export const authOutbox = pgTable(
  'auth_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    aggregateType: varchar('aggregate_type', { length: 30 }).notNull(),
    aggregateId: varchar('aggregate_id', { length: 100 }).notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),

    // JSONB 必须由 Worker 做运行时校验，不能静态信任。
    payload: jsonb('payload').$type<unknown>().notNull(),

    attempts: integer('attempts').default(0).notNull(),
    lockedBy: varchar('locked_by', { length: 100 }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    lastError: varchar('last_error', { length: 1000 }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    index('auth_outbox_claim_idx').on(
      table.publishedAt,
      table.nextAttemptAt,
      table.lockedAt,
      table.createdAt,
    ),
  ],
)
~~~

## 4.2 修正 Drizzle 环境文件加载

当前运行时使用 DB_HOST、DB_PORT 等变量，而 drizzle.config.ts 使用 DATABASE_URL。你必须确认两套配置指向同一个 PostgreSQL。

修改文件：

~~~text
apps/server/drizzle.config.ts
~~~

替换为：

~~~ts
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

const nodeEnv = process.env.NODE_ENV ?? 'development'

for (const path of [
  '.env.' + nodeEnv + '.local',
  '.env.local',
  '.env.' + nodeEnv,
  '.env',
]) {
  config({ path })
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 未配置')
}

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
~~~

## 4.3 修正现有测试 DTO

当前测试 DTO 直接从 users 生成插入结构。如果不改，它会逐渐把 passwordHash、authEpoch 和 status 暴露给客户端。

修改：

~~~text
apps/server/src/modules/test/db/dto/create-user.dto.ts
~~~

把 omit 改为：

~~~ts
export const createUserSchema = baseSchema.omit({
  id: true,
  passwordHash: true,
  status: true,
  authEpoch: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
})
~~~

这个 TestDbModule 只能当数据库示例，不能当正式注册接口。正式注册接口接收 password，由服务端生成 passwordHash，绝不能让客户端上传密码哈希。

生产环境建议从 AppModule 移除 TestDbModule 和 TestRedisModule。

## 4.4 生成迁移

执行：

~~~powershell
vp run "server#db:generate"
~~~

不要马上 migrate。先打开 apps/server/drizzle 下新生成的 SQL，人工确认：

- 没有 DROP users。
- 没有重命名 create_at。
- password_hash 当前允许 NULL。
- token_hash 有唯一索引。
- family_id 和 generation 有联合唯一索引。
- auth_epoch 和 session version 默认值都是 1。

确认 SQL 后再执行：

~~~powershell
vp run "server#db:migrate"
vp run "server#build"
~~~

## 完成检查点

- 五张 Auth 相关表已经存在。
- 旧 users 数据没有因为 password_hash 而迁移失败。
- 两个 Refresh Token 唯一约束已存在。
- 迁移所用 DATABASE_URL 与服务运行时 DB_* 指向同一数据库。
- 构建成功。

# 步骤 5：实现密码和 Token 安全原语

## 本步目标

先完成最底层、可单独理解的安全组件：

- Argon2id 密码哈希。
- 随机 Refresh Token 和 HMAC 摘要。
- Access JWT 签发与严格验证。
- Auth 公共类型和元数据常量。

## 5.1 新增元数据常量

新增：

~~~text
apps/server/src/common/constants/auth.ts
~~~

粘贴：

~~~ts
export const IS_PUBLIC_KEY = Symbol('is_public')
export const AUTH_CONSISTENCY_KEY = Symbol('auth_consistency')

export type AuthConsistency = 'bounded' | 'strong'
~~~

## 5.2 新增 Auth 类型

新增：

~~~text
apps/server/src/modules/auth/auth.types.ts
~~~

粘贴：

~~~ts
export interface AccessTokenClaims {
  sub: string
  sid: string
  ae: number
  sv: number
  jti: string
  iss: string
  aud: string | string[]
  iat: number
  exp: number
}

export interface AuthPrincipal {
  userId: string
  sessionId: string
  accountEpoch: number
  sessionVersion: number
  tokenId: string
}

export interface AccountAuthState {
  userId: string
  status: 'active' | 'locked' | 'disabled'
  epoch: number
}

export interface SessionAuthState {
  sessionId: string
  userId: string
  status: 'active' | 'revoked'
  version: number
  expiresAtMs: number
}

export interface AuthStateSnapshot {
  account: AccountAuthState
  session: SessionAuthState
}

export interface IssuedTokenPair {
  accessToken: string
  accessExpiresIn: number
  refreshToken: string
}
~~~

## 5.3 新增 PasswordService

新增：

~~~text
apps/server/src/modules/auth/password.service.ts
~~~

粘贴：

~~~ts
import { Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'

const HASH_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
}

@Injectable()
export class PasswordService {
  private readonly dummyHash = argon2.hash(
    'not-a-real-user-password-for-timing-equalization',
    HASH_OPTIONS,
  )

  hash(password: string) {
    return argon2.hash(password, HASH_OPTIONS)
  }

  async verify(passwordHash: string | null, password: string) {
    const targetHash = passwordHash ?? (await this.dummyHash)

    try {
      return await argon2.verify(targetHash, password)
    } catch {
      await argon2.verify(await this.dummyHash, password).catch(() => false)
      return false
    }
  }
}
~~~

当邮箱不存在时仍执行一次 Argon2 验证，减少通过响应时间枚举邮箱的差异。

## 5.4 新增 TokenService

新增：

~~~text
apps/server/src/modules/auth/token.service.ts
~~~

粘贴：

~~~ts
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import type { AuthConfig } from '@/config/auth.config'
import type { AccessTokenClaims } from './auth.types'

@Injectable()
export class RefreshTokenCodec {
  constructor(private readonly config: ConfigService) {}

  create() {
    const raw = randomBytes(32).toString('base64url')

    return {
      raw,
      hash: this.hash(raw),
    }
  }

  hash(raw: string) {
    const auth = this.config.getOrThrow<AuthConfig>('auth')

    return createHmac('sha256', auth.refreshPepper)
      .update(raw)
      .digest('hex')
  }
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async sign(input: {
    userId: number
    sessionId: string
    accountEpoch: number
    sessionVersion: number
  }) {
    const auth = this.config.getOrThrow<AuthConfig>('auth')

    const accessToken = await this.jwt.signAsync({
      sub: String(input.userId),
      sid: input.sessionId,
      ae: input.accountEpoch,
      sv: input.sessionVersion,
      jti: randomUUID(),
    })

    return {
      accessToken,
      accessExpiresIn: auth.accessTtlSeconds,
    }
  }

  async verify(raw: string) {
    let claims: AccessTokenClaims

    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(raw)
    } catch {
      throw new UnauthorizedException('访问令牌无效或已过期')
    }

    const auth = this.config.getOrThrow<AuthConfig>('auth')

    const validShape =
      /^[1-9]\d*$/.test(claims.sub) &&
      typeof claims.sid === 'string' &&
      claims.sid.length > 0 &&
      typeof claims.jti === 'string' &&
      claims.jti.length > 0 &&
      Number.isSafeInteger(claims.ae) &&
      claims.ae >= 1 &&
      Number.isSafeInteger(claims.sv) &&
      claims.sv >= 1 &&
      Number.isSafeInteger(claims.iat) &&
      Number.isSafeInteger(claims.exp) &&
      claims.exp > claims.iat &&
      claims.exp - claims.iat <=
        auth.accessTtlSeconds + auth.clockToleranceSeconds

    if (!validShape) {
      throw new UnauthorizedException('访问令牌载荷非法')
    }

    return claims
  }
}
~~~

Access JWT 的 iss、aud、exp 和签名算法稍后由 JwtModule 统一配置。不要手工从请求载荷信任这些字段。

Refresh Token 数据库只保存 hash。raw 只在创建时返回给 Controller 写入 Cookie。

## 验收命令

~~~powershell
vp run "server#build"
~~~

## 完成检查点

- 密码使用 Argon2id。
- Refresh Token 使用 32 字节随机数。
- Refresh 摘要使用 HMAC-SHA256 和服务端 pepper。
- JWT 包含 sub、sid、ae、sv 和 jti。
- 构建成功。

# 步骤 6：先实现全部接口实时强校验的 Auth State

## 本步目标

此时不要急着加入 30 秒缓存。先做一版所有保护接口都实时读取 Redis 的实现，验证下面的闭环：

~~~text
登录写入 Auth State
-> JWT 带 ae 和 sv
-> Guard 用一个 Lua 原子读取 Account + Session
-> 版本和状态完全匹配才放行
-> Redis 缺失或落后时，用一条 PostgreSQL JOIN 回源
-> 踢人或改密写入更高版本
-> 下一次强校验拒绝旧 JWT
~~~

这里有四条硬性不变量：

1. 账号安全状态发生任何变化，都必须先让 accountAuthEpoch 严格加 1。
2. Session 有效性发生任何变化，都必须先让 sessionVersion 严格加 1。
3. Session 的 expiresAt 如果允许修改，也必须同时增加 sessionVersion。
4. 已经 revoked 的 sid 永远不能恢复 active；重新登录必须创建新的 sid。

## 6.1 新增 AuthStateService

新增：

~~~text
apps/server/src/modules/auth/state/auth-state.service.ts
~~~

粘贴完整代码：

~~~ts
import { InjectRedis } from '@nestjs-modules/ioredis'
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { and, eq } from 'drizzle-orm'
import type Redis from 'ioredis'
import type { AuthConsistency } from '@/common/constants/auth'
import type { AuthConfig } from '@/config/auth.config'
import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import { authSessions, users } from '@/database/schema'
import type {
  AccessTokenClaims,
  AccountAuthState,
  AuthStateSnapshot,
  SessionAuthState,
} from '../auth.types'

type ProjectionWriteResult = 'applied' | 'identical' | 'stale'

const READ_AUTH_STATE_LUA = [
  "local accountEpoch = redis.call('HGET', KEYS[1], 'epoch') or ''",
  "local accountStatus = redis.call('HGET', KEYS[1], 'status') or ''",
  "local sessionVersion = redis.call('HGET', KEYS[2], 'version') or ''",
  "local sessionStatus = redis.call('HGET', KEYS[2], 'status') or ''",
  "local sessionUserId = redis.call('HGET', KEYS[2], 'userId') or ''",
  "local sessionExpiresAtMs = redis.call('HGET', KEYS[2], 'expiresAtMs') or ''",
  'return {',
  '  accountEpoch,',
  '  accountStatus,',
  '  sessionVersion,',
  '  sessionStatus,',
  '  sessionUserId,',
  '  sessionExpiresAtMs',
  '}',
].join('\n')

const ACCOUNT_PROJECTION_LUA = [
  "local currentEpoch = redis.call('HGET', KEYS[1], 'epoch')",
  'local incomingEpoch = tonumber(ARGV[1])',
  '',
  'if not incomingEpoch then',
  '  return -2',
  'end',
  '',
  "if ARGV[2] ~= 'active'",
  "  and ARGV[2] ~= 'locked'",
  "  and ARGV[2] ~= 'disabled' then",
  '  return -2',
  'end',
  '',
  'if not currentEpoch then',
  "  if redis.call('EXISTS', KEYS[1]) == 1 then",
  '    return -2',
  '  end',
  'else',
  '  local parsedCurrentEpoch = tonumber(currentEpoch)',
  "  local currentStatus = redis.call('HGET', KEYS[1], 'status')",
  '',
  '  if not parsedCurrentEpoch',
  '    or not currentStatus',
  "    or (currentStatus ~= 'active'",
  "      and currentStatus ~= 'locked'",
  "      and currentStatus ~= 'disabled') then",
  '    return -2',
  '  end',
  '',
  '  if parsedCurrentEpoch > incomingEpoch then',
  '    return 0',
  '  end',
  '',
  '  if parsedCurrentEpoch == incomingEpoch then',
  '    if currentStatus == ARGV[2] then',
  '      return 2',
  '    end',
  '',
  '    return -1',
  '  end',
  'end',
  '',
  "redis.call('HSET', KEYS[1],",
  "  'epoch', ARGV[1],",
  "  'status', ARGV[2])",
  'return 1',
].join('\n')

const SESSION_PROJECTION_LUA = [
  "local currentVersion = redis.call('HGET', KEYS[1], 'version')",
  'local incomingVersion = tonumber(ARGV[1])',
  'local expiresAtMs = tonumber(ARGV[4])',
  'local ttlSeconds = tonumber(ARGV[5])',
  '',
  'if not incomingVersion',
  '  or not expiresAtMs',
  '  or not ttlSeconds',
  '  or ttlSeconds <= 0',
  "  or ARGV[3] == ''",
  "  or (ARGV[2] ~= 'active' and ARGV[2] ~= 'revoked') then",
  '  return -2',
  'end',
  '',
  'if not currentVersion then',
  "  if redis.call('EXISTS', KEYS[1]) == 1 then",
  '    return -2',
  '  end',
  'else',
  '  local parsedCurrentVersion = tonumber(currentVersion)',
  "  local currentStatus = redis.call('HGET', KEYS[1], 'status')",
  "  local currentUserId = redis.call('HGET', KEYS[1], 'userId')",
  "  local currentExpiresAtMs = redis.call('HGET', KEYS[1], 'expiresAtMs')",
  '',
  '  if not parsedCurrentVersion',
  '    or not currentStatus',
  '    or not currentUserId',
  '    or not currentExpiresAtMs',
  "    or (currentStatus ~= 'active'",
  "      and currentStatus ~= 'revoked') then",
  '    return -2',
  '  end',
  '',
  '  if parsedCurrentVersion > incomingVersion then',
  '    return 0',
  '  end',
  '',
  '  if parsedCurrentVersion == incomingVersion then',
  '    if currentStatus == ARGV[2]',
  '      and currentUserId == ARGV[3]',
  '      and currentExpiresAtMs == ARGV[4] then',
  "      redis.call('EXPIRE', KEYS[1], ttlSeconds)",
  '      return 2',
  '    end',
  '',
  '    return -1',
  '  end',
  '',
  "  if currentStatus == 'revoked' and ARGV[2] == 'active' then",
  '    return -1',
  '  end',
  'end',
  '',
  "redis.call('HSET', KEYS[1],",
  "  'version', ARGV[1],",
  "  'status', ARGV[2],",
  "  'userId', ARGV[3],",
  "  'expiresAtMs', ARGV[4])",
  "redis.call('EXPIRE', KEYS[1], ttlSeconds)",
  'return 1',
].join('\n')

function accountKey(userId: string) {
  return 'auth:account:{' + userId + '}'
}

function sessionKey(userId: string, sessionId: string) {
  return 'auth:session:{' + userId + '}:' + sessionId
}

@Injectable()
export class AuthStateService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ConfigService,
  ) {}

  async verify(
    claims: AccessTokenClaims,
    _consistency: AuthConsistency = 'strong',
  ) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const shared = await this.readShared(claims.sub, claims.sid)

      this.throwIfSharedIsNewer(shared, claims)

      if (shared.account && shared.session) {
        this.assertAllowed(
          {
            account: shared.account,
            session: shared.session,
          },
          claims,
        )
        return
      }

      const database = await this.loadDatabaseSnapshot(
        claims.sub,
        claims.sid,
      )

      if (!database) {
        throw new UnauthorizedException('登录状态不存在')
      }

      if (
        database.account.epoch < claims.ae ||
        database.session.version < claims.sv
      ) {
        throw new ServiceUnavailableException(
          '鉴权事实库版本落后于 JWT',
        )
      }

      const [accountProjection, sessionProjection] =
        await Promise.all([
          this.projectAccount(database.account),
          this.projectSession(database.session),
        ])

      if (
        accountProjection === 'stale' ||
        sessionProjection === 'stale'
      ) {
        continue
      }

      const repaired = await this.readShared(
        claims.sub,
        claims.sid,
      )

      this.throwIfSharedIsNewer(repaired, claims)

      if (repaired.account && repaired.session) {
        this.assertAllowed(
          {
            account: repaired.account,
            session: repaired.session,
          },
          claims,
        )
        return
      }
    }

    throw new ServiceUnavailableException(
      '鉴权状态正在变化，请稍后重试',
    )
  }

  async writeThroughAccount(state: AccountAuthState) {
    const result = await this.projectAccount(state)

    if (result === 'stale') {
      throw new ServiceUnavailableException(
        '账号鉴权状态已经存在更高版本',
      )
    }
  }

  async writeThroughSession(state: SessionAuthState) {
    const result = await this.projectSession(state)

    if (result === 'stale') {
      throw new ServiceUnavailableException(
        'Session 鉴权状态已经存在更高版本',
      )
    }
  }

  private async readShared(
    userId: string,
    sessionId: string,
  ): Promise<{
    account: AccountAuthState | null
    session: SessionAuthState | null
  }> {
    try {
      const raw = await this.redis.eval(
        READ_AUTH_STATE_LUA,
        2,
        accountKey(userId),
        sessionKey(userId, sessionId),
      )

      if (!Array.isArray(raw) || raw.length !== 6) {
        throw new Error('Redis Auth State 返回结构错误')
      }

      const [
        accountEpoch,
        accountStatus,
        sessionVersion,
        sessionStatus,
        sessionUserId,
        sessionExpiresAtMs,
      ] = raw.map((value) => String(value ?? ''))

      return {
        account: this.parseAccount(
          userId,
          accountEpoch,
          accountStatus,
        ),
        session: this.parseSession(
          userId,
          sessionId,
          sessionVersion,
          sessionStatus,
          sessionUserId,
          sessionExpiresAtMs,
        ),
      }
    } catch {
      throw new ServiceUnavailableException(
        '共享鉴权状态暂时不可用',
      )
    }
  }

  private async loadDatabaseSnapshot(
    userId: string,
    sessionId: string,
  ): Promise<AuthStateSnapshot | null> {
    const numericUserId = Number(userId)

    if (
      !Number.isSafeInteger(numericUserId) ||
      numericUserId <= 0
    ) {
      return null
    }

    try {
      const [row] = await this.db
        .select({
          accountStatus: users.status,
          accountEpoch: users.authEpoch,
          sessionId: authSessions.id,
          sessionUserId: authSessions.userId,
          sessionStatus: authSessions.status,
          sessionVersion: authSessions.version,
          sessionExpiresAt: authSessions.expiresAt,
        })
        .from(users)
        .innerJoin(
          authSessions,
          and(
            eq(authSessions.userId, users.id),
            eq(authSessions.id, sessionId),
          ),
        )
        .where(eq(users.id, numericUserId))
        .limit(1)

      if (!row) {
        return null
      }

      return {
        account: {
          userId,
          status: row.accountStatus,
          epoch: row.accountEpoch,
        },
        session: {
          sessionId: row.sessionId,
          userId: String(row.sessionUserId),
          status: row.sessionStatus,
          version: row.sessionVersion,
          expiresAtMs: row.sessionExpiresAt.getTime(),
        },
      }
    } catch {
      throw new ServiceUnavailableException(
        '鉴权事实库暂时不可用',
      )
    }
  }

  private async projectAccount(
    state: AccountAuthState,
  ): Promise<ProjectionWriteResult> {
    let raw: unknown

    try {
      raw = await this.redis.eval(
        ACCOUNT_PROJECTION_LUA,
        1,
        accountKey(state.userId),
        String(state.epoch),
        state.status,
      )
    } catch {
      throw new ServiceUnavailableException(
        '账号鉴权状态暂时不可用',
      )
    }

    return this.decodeProjectionResult(raw, '账号')
  }

  private async projectSession(
    state: SessionAuthState,
  ): Promise<ProjectionWriteResult> {
    const auth = this.config.getOrThrow<AuthConfig>('auth')
    const activeTtl = Math.ceil(
      (state.expiresAtMs - Date.now()) / 1000,
    )
    const ttlSeconds =
      state.status === 'revoked'
        ? auth.tombstoneTtlSeconds
        : Math.max(activeTtl, auth.tombstoneTtlSeconds)

    let raw: unknown

    try {
      raw = await this.redis.eval(
        SESSION_PROJECTION_LUA,
        1,
        sessionKey(state.userId, state.sessionId),
        String(state.version),
        state.status,
        state.userId,
        String(state.expiresAtMs),
        String(ttlSeconds),
      )
    } catch {
      throw new ServiceUnavailableException(
        'Session 鉴权状态暂时不可用',
      )
    }

    return this.decodeProjectionResult(raw, 'Session')
  }

  private decodeProjectionResult(
    raw: unknown,
    aggregateName: string,
  ): ProjectionWriteResult {
    const code = Number(raw)

    if (code === 1) {
      return 'applied'
    }

    if (code === 2) {
      return 'identical'
    }

    if (code === 0) {
      return 'stale'
    }

    throw new ServiceUnavailableException(
      aggregateName + '鉴权状态存在版本冲突',
    )
  }

  private throwIfSharedIsNewer(
    shared: {
      account: AccountAuthState | null
      session: SessionAuthState | null
    },
    claims: AccessTokenClaims,
  ) {
    if (
      (shared.account && shared.account.epoch > claims.ae) ||
      (shared.session && shared.session.version > claims.sv)
    ) {
      throw new UnauthorizedException('登录状态已失效')
    }
  }

  private parseAccount(
    userId: string,
    epochRaw: string,
    statusRaw: string,
  ): AccountAuthState | null {
    const epoch = Number(epochRaw)

    if (
      !Number.isSafeInteger(epoch) ||
      epoch < 1 ||
      !['active', 'locked', 'disabled'].includes(statusRaw)
    ) {
      return null
    }

    return {
      userId,
      status: statusRaw as AccountAuthState['status'],
      epoch,
    }
  }

  private parseSession(
    expectedUserId: string,
    sessionId: string,
    versionRaw: string,
    statusRaw: string,
    userIdRaw: string,
    expiresAtMsRaw: string,
  ): SessionAuthState | null {
    const version = Number(versionRaw)
    const expiresAtMs = Number(expiresAtMsRaw)

    if (
      userIdRaw !== expectedUserId ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      !Number.isSafeInteger(expiresAtMs) ||
      expiresAtMs <= 0 ||
      !['active', 'revoked'].includes(statusRaw)
    ) {
      return null
    }

    return {
      sessionId,
      userId: userIdRaw,
      status: statusRaw as SessionAuthState['status'],
      version,
      expiresAtMs,
    }
  }

  private assertAllowed(
    snapshot: AuthStateSnapshot,
    claims: AccessTokenClaims,
  ) {
    if (
      snapshot.account.epoch < claims.ae ||
      snapshot.session.version < claims.sv
    ) {
      throw new ServiceUnavailableException(
        '鉴权状态投影落后',
      )
    }

    const accepted =
      snapshot.account.status === 'active' &&
      snapshot.session.status === 'active' &&
      snapshot.session.userId === claims.sub &&
      snapshot.account.epoch === claims.ae &&
      snapshot.session.version === claims.sv &&
      snapshot.session.expiresAtMs > Date.now()

    if (!accepted) {
      throw new UnauthorizedException('登录状态已失效')
    }
  }
}
~~~

两个 Redis key 都带相同的 {userId} hash tag，所以即使以后使用 Redis Cluster，也会落在同一个 slot；READ_AUTH_STATE_LUA 可以一次看到账号和 Session 的同一 Redis 执行时点。

ACCOUNT_PROJECTION_LUA 和 SESSION_PROJECTION_LUA 的返回值含义是：

| 返回值 | 含义 | 处理 |
| --- | --- | --- |
| 1 | 新版本已写入 | 继续 |
| 2 | 相同版本、所有字段完全相同 | 幂等成功 |
| 0 | Redis 已有更高版本 | 重新 Pull，不能覆盖 |
| -1 / -2 | 同版本字段冲突、revoked 复活、参数或投影损坏 | 返回 503 并报警 |

不要把“相同 version、不同 status”当作可覆盖更新。状态变化而版本不变，是写路径违反不变量，应立即暴露。

## 6.2 构建验收

执行：

~~~powershell
vp run "server#build"
~~~

此时 AuthModule 还没有在后续步骤完整接入，所以这里只做类型和编译验收。

完成检查：

- readShared 里只有一次 EVAL，没有两次 HGETALL。
- PostgreSQL 回源只有一条带 innerJoin 的 SELECT，没有 Promise.all 两条查询。
- 相同版本、不同字段返回 503。
- Redis 中 sid 一旦 revoked，任何 active 投影都被拒绝。
- Redis 不可用时强校验返回 503，不会默认 active。
- 构建成功。

# 步骤 7：跑通注册和登录闭环

## 本步目标

本步骤完成：

~~~text
注册账号
-> 服务端 Argon2id 哈希密码
-> 登录校验密码
-> PostgreSQL 创建 Session、Family、Refresh Token
-> Redis 写入账号和 Session 状态
-> 返回 Access JWT
-> Refresh Token 写入 HttpOnly Cookie
~~~

教程增加一个公开注册接口只是为了让你能独立完成验收。如果你的产品不允许用户自注册，完成测试后删除 register Controller 路由，把注册能力放到管理员或邀请流程中。

## 7.1 新增 Public 装饰器

新增：

~~~text
apps/server/src/common/decorators/public.decorator.ts
~~~

粘贴：

~~~ts
import { SetMetadata } from '@nestjs/common'
import { IS_PUBLIC_KEY } from '@/common/constants/auth'

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
~~~

它和现有 Bypass 的职责完全不同：

- Public：跳过身份鉴权。
- Bypass：跳过统一响应包装。

不要合并这两个元数据。

## 7.2 新增 DTO

新增：

~~~text
apps/server/src/modules/auth/dto/register.dto.ts
~~~

粘贴：

~~~ts
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
  password: z.string().min(12).max(200),
})

export class RegisterDto extends createZodDto(RegisterSchema) {}
~~~

新增：

~~~text
apps/server/src/modules/auth/dto/login.dto.ts
~~~

粘贴：

~~~ts
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
  password: z.string().min(1).max(200),
})

export class LoginDto extends createZodDto(LoginSchema) {}
~~~

## 7.3 新增 Refresh Cookie Helper

新增：

~~~text
apps/server/src/modules/auth/http/refresh-cookie.ts
~~~

粘贴：

~~~ts
import type { FastifyReply } from 'fastify'
import type { AuthConfig } from '@/config/auth.config'

export function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  config: AuthConfig,
) {
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: config.cookiePath,
    domain: config.cookieDomain,
    maxAge: config.refreshTtlSeconds,
  })
}

export function clearRefreshCookie(
  reply: FastifyReply,
  config: AuthConfig,
) {
  reply.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: config.cookiePath,
    domain: config.cookieDomain,
  })
}
~~~

如果前端和 API 跨站部署，SameSite、Secure、CORS 和 CSRF 需要一起设计，不能只把 sameSite 改成 none 就结束。当前教程按同站部署处理。

## 7.4 新增 AuthRepository

新增：

~~~text
apps/server/src/modules/auth/auth.repository.ts
~~~

粘贴：

~~~ts
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import {
  authSessions,
  refreshTokenFamilies,
  refreshTokens,
  users,
} from '@/database/schema'

@Injectable()
export class AuthRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  findUserByEmail(email: string) {
    return this.db.query.users.findFirst({
      where: eq(users.email, email),
    })
  }

  findUserById(userId: number) {
    return this.db.query.users.findFirst({
      where: eq(users.id, userId),
    })
  }

  async createUser(input: {
    name: string
    email: string
    passwordHash: string
  }) {
    const [user] = await this.db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
      })
      .returning()

    return user
  }

  createLoginSession(input: {
    userId: number
    accountEpoch: number
    refreshTokenHash: string
    expiresAt: Date
    ip?: string
    userAgent?: string
  }) {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(authSessions)
        .values({
          userId: input.userId,
          expiresAt: input.expiresAt,
          ip: input.ip,
          userAgent: input.userAgent,
        })
        .returning()

      const [family] = await tx
        .insert(refreshTokenFamilies)
        .values({
          sessionId: session.id,
          accountEpochAtCreate: input.accountEpoch,
          currentGeneration: 1,
          expiresAt: input.expiresAt,
        })
        .returning()

      await tx.insert(refreshTokens).values({
        familyId: family.id,
        tokenHash: input.refreshTokenHash,
        generation: 1,
        expiresAt: input.expiresAt,
      })

      return session
    })
  }
}
~~~

## 7.5 新增 AuthService

新增：

~~~text
apps/server/src/modules/auth/auth.service.ts
~~~

粘贴：

~~~ts
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AuthConfig } from '@/config/auth.config'
import { AuthRepository } from './auth.repository'
import type { IssuedTokenPair } from './auth.types'
import { PasswordService } from './password.service'
import { AuthStateService } from './state/auth-state.service'
import { AccessTokenService, RefreshTokenCodec } from './token.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenCodec,
    private readonly accessTokens: AccessTokenService,
    private readonly authState: AuthStateService,
    private readonly config: ConfigService,
  ) {}

  async register(input: {
    name: string
    email: string
    password: string
  }) {
    const email = input.email.trim().toLowerCase()
    const existing = await this.repository.findUserByEmail(email)

    if (existing) {
      throw new ConflictException('邮箱已存在')
    }

    const passwordHash = await this.passwords.hash(input.password)

    try {
      const user = await this.repository.createUser({
        name: input.name.trim(),
        email,
        passwordHash,
      })

      return {
        id: user.id,
        name: user.name,
        email: user.email,
      }
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('邮箱已存在')
      }

      throw error
    }
  }

  async login(
    input: {
      email: string
      password: string
    },
    context: {
      ip?: string
      userAgent?: string
    },
  ): Promise<IssuedTokenPair> {
    const email = input.email.trim().toLowerCase()
    const user = await this.repository.findUserByEmail(email)
    const passwordMatched = await this.passwords.verify(
      user?.passwordHash ?? null,
      input.password,
    )

    if (
      !user ||
      !passwordMatched ||
      !user.passwordHash ||
      user.status !== 'active'
    ) {
      throw new UnauthorizedException('邮箱或密码错误')
    }

    const auth = this.config.getOrThrow<AuthConfig>('auth')
    const refreshToken = this.refreshTokens.create()
    const expiresAt = new Date(Date.now() + auth.refreshTtlSeconds * 1000)

    const session = await this.repository.createLoginSession({
      userId: user.id,
      accountEpoch: user.authEpoch,
      refreshTokenHash: refreshToken.hash,
      expiresAt,
      ip: context.ip,
      userAgent: context.userAgent,
    })

    await Promise.all([
      this.authState.writeThroughAccount({
        userId: String(user.id),
        status: user.status,
        epoch: user.authEpoch,
      }),
      this.authState.writeThroughSession({
        sessionId: session.id,
        userId: String(user.id),
        status: session.status,
        version: session.version,
        expiresAtMs: session.expiresAt.getTime(),
      }),
    ])

    const access = await this.accessTokens.sign({
      userId: user.id,
      sessionId: session.id,
      accountEpoch: user.authEpoch,
      sessionVersion: session.version,
    })

    return {
      ...access,
      refreshToken: refreshToken.raw,
    }
  }
}
~~~

登录事务提交后才写 Redis。如果 Redis 此时不可用，接口返回 503，客户端拿不到 Token；数据库里可能留下一个不会被使用的 Session，它会在 expiresAt 后由清理任务删除。步骤 13 的 Outbox 只保障撤销、禁用和版本提升类状态，不恢复登录创建投影。

## 7.6 新增 AuthController

新增：

~~~text
apps/server/src/modules/auth/auth.controller.ts
~~~

粘贴：

~~~ts
import { Body, Controller, Post, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiTags } from '@nestjs/swagger'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { Public } from '@/common/decorators/public.decorator'
import type { AuthConfig } from '@/config/auth.config'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { setRefreshCookie } from './http/refresh-cookie'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body)
  }

  @Public()
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.login(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    })

    const auth = this.config.getOrThrow<AuthConfig>('auth')
    setRefreshCookie(reply, result.refreshToken, auth)

    return {
      accessToken: result.accessToken,
      expiresIn: result.accessExpiresIn,
    }
  }
}
~~~

Refresh Token 不出现在 JSON 响应，只通过 Set-Cookie 返回。

## 7.7 新增 AuthModule

新增：

~~~text
apps/server/src/modules/auth/auth.module.ts
~~~

粘贴：

~~~ts
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt'
import type { AuthConfig } from '@/config/auth.config'
import { AuthController } from './auth.controller'
import { AuthRepository } from './auth.repository'
import { AuthService } from './auth.service'
import { PasswordService } from './password.service'
import { AuthStateService } from './state/auth-state.service'
import { AccessTokenService, RefreshTokenCodec } from './token.service'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const auth = config.getOrThrow<AuthConfig>('auth')

        return {
          secret: auth.accessSecret,
          signOptions: {
            algorithm: 'HS256',
            expiresIn: auth.accessTtlSeconds,
            issuer: auth.issuer,
            audience: auth.audience,
          },
          verifyOptions: {
            algorithms: ['HS256'],
            issuer: auth.issuer,
            audience: auth.audience,
            clockTolerance: auth.clockToleranceSeconds,
          },
        }
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    PasswordService,
    RefreshTokenCodec,
    AccessTokenService,
    AuthStateService,
  ],
  exports: [AuthService, AuthStateService],
})
export class AuthModule {}
~~~

HS256 只用于当前单体施工。多微服务生产环境不要把同一个对称密钥发给所有服务，最后一章会说明如何改成私钥签发、公钥验签。

## 7.8 接入 AppModule

修改：

~~~text
apps/server/src/app.module.ts
~~~

替换为以下完整内容：

~~~ts
import { RedisModule } from '@nestjs-modules/ioredis'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod'
import { ResponseInterceptor } from '@/common/interceptors/transform'
import {
  appConfig,
  authConfig,
  databaseConfig,
  llmConfig,
  redisConfig,
} from '@/config'
import { DatabaseModule } from './database/db.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './modules/auth/auth.module'
import { TestDbModule } from './modules/test/db/db.module'
import { TestRedisModule } from './modules/test/redis/redis.module'

const nodeEnv = process.env.NODE_ENV ?? 'development'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env.' + nodeEnv + '.local',
        '.env.local',
        '.env.' + nodeEnv,
        '.env',
      ],
      load: [appConfig, authConfig, databaseConfig, llmConfig, redisConfig],
    }),
    DatabaseModule,
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        options: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password'),
          db: config.get('redis.db'),
        },
      }),
    }),
    AuthModule,

    // 仅保留用于模板调试，生产环境应移除
    TestRedisModule,
    TestDbModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
  ],
})
export class AppModule {}
~~~

## 7.9 构建并启动

执行：

~~~powershell
vp run "server#build"
vp run "server#dev"
~~~

## 7.10 手工验收注册

另开 PowerShell：

~~~powershell
$body = @{
  name = "测试用户"
  email = "auth-test@example.com"
  password = "Correct-Horse-Battery-123!"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/register" -ContentType "application/json" -Body $body
~~~

由于项目已有 ResponseInterceptor，成功响应不是裸数据，而是：

~~~json
{
  "code": 200,
  "data": {
    "id": 1,
    "name": "测试用户",
    "email": "auth-test@example.com"
  },
  "message": "success"
}
~~~

## 7.11 手工验收登录和 Cookie

~~~powershell
$web = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$body = @{
  email = "auth-test@example.com"
  password = "Correct-Horse-Battery-123!"
} | ConvertTo-Json

$login = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/login" -ContentType "application/json" -Body $body -WebSession $web

$accessToken = $login.data.accessToken
$login.data
$web.Cookies.GetCookies("http://localhost:3000")
~~~

你应该看到：

- JSON 只有 accessToken 和 expiresIn。
- Cookie 中存在 refresh_token。
- Cookie 是 HttpOnly。
- 数据库 refresh_tokens.token_hash 是 64 位十六进制摘要，不是浏览器 Cookie 原文。

再用错误密码登录，应该得到相同的 401 文案“邮箱或密码错误”，不能区分邮箱不存在和密码错误。

## 完成检查点

- 注册成功。
- 登录成功。
- Refresh Token 只在 HttpOnly Cookie。
- PostgreSQL 没有 Refresh Token 原文。
- Redis 已出现 account 和 session 两类 key。

# 步骤 8：加入全局 Guard、CurrentAuth 和默认强校验

## 本步目标

让所有没有 Public 的接口默认需要 JWT，并在第一阶段全部实时读取 Redis。

## 8.1 新增 StrongAuth 装饰器

新增：

~~~text
apps/server/src/common/decorators/strong-auth.decorator.ts
~~~

粘贴：

~~~ts
import { SetMetadata } from '@nestjs/common'
import { AUTH_CONSISTENCY_KEY } from '@/common/constants/auth'

export const StrongAuth = () => SetMetadata(AUTH_CONSISTENCY_KEY, 'strong')
~~~

此时所有接口本来就会强校验。这个装饰器先建立语义，等步骤 11 把默认值改成 bounded 后，它才真正负责绕过 L1。

## 8.2 新增 CurrentAuth 参数装饰器

新增：

~~~text
apps/server/src/common/decorators/current-auth.decorator.ts
~~~

粘贴：

~~~ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import type { AuthPrincipal } from '@/modules/auth/auth.types'

type AuthenticatedRequest = FastifyRequest & {
  auth: AuthPrincipal
}

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
)
~~~

## 8.3 新增全局 HybridAuthGuard

新增：

~~~text
apps/server/src/modules/auth/guards/hybrid-auth.guard.ts
~~~

粘贴：

~~~ts
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import {
  AUTH_CONSISTENCY_KEY,
  type AuthConsistency,
  IS_PUBLIC_KEY,
} from '@/common/constants/auth'
import type { AuthPrincipal } from '../auth.types'
import { AuthStateService } from '../state/auth-state.service'
import { AccessTokenService } from '../token.service'

type AuthenticatedRequest = FastifyRequest & {
  auth?: AuthPrincipal
}

@Injectable()
export class HybridAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly authState: AuthStateService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()]

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    )

    if (isPublic) {
      return true
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>()

    const rawToken = this.extractBearer(request.headers.authorization)
    const claims = await this.accessTokens.verify(rawToken)

    // 第一阶段故意默认 strong；步骤 11 再改成 bounded
    const consistency =
      this.reflector.getAllAndOverride<AuthConsistency>(
        AUTH_CONSISTENCY_KEY,
        targets,
      ) ?? 'strong'

    await this.authState.verify(claims, consistency)

    request.auth = Object.freeze({
      userId: claims.sub,
      sessionId: claims.sid,
      accountEpoch: claims.ae,
      sessionVersion: claims.sv,
      tokenId: claims.jti,
    })

    return true
  }

  private extractBearer(header: string | undefined) {
    if (!header) {
      throw new UnauthorizedException('缺少访问令牌')
    }

    const [scheme, token, extra] = header.trim().split(/\s+/)

    if (
      extra ||
      scheme?.toLowerCase() !== 'bearer' ||
      !token
    ) {
      throw new UnauthorizedException('Authorization 格式错误')
    }

    return token
  }
}
~~~

## 8.4 注册 APP_GUARD

修改：

~~~text
apps/server/src/modules/auth/auth.module.ts
~~~

在 import 中增加：

~~~ts
import { APP_GUARD } from '@nestjs/core'
import { HybridAuthGuard } from './guards/hybrid-auth.guard'
~~~

在 providers 最后增加：

~~~ts
{
  provide: APP_GUARD,
  useClass: HybridAuthGuard,
},
~~~

不要在 AppModule 再注册第二次相同 Guard。

## 8.5 增加 me 接口

修改：

~~~text
apps/server/src/modules/auth/auth.controller.ts
~~~

把 Nest import 增加 Get：

~~~ts
import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common'
~~~

把 Swagger import 改成：

~~~ts
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
~~~

增加两个 import：

~~~ts
import { CurrentAuth } from '@/common/decorators/current-auth.decorator'
import type { AuthPrincipal } from './auth.types'
~~~

在 Controller 类中增加：

~~~ts
@ApiBearerAuth('access-token')
@Get('me')
me(@CurrentAuth() auth: AuthPrincipal) {
  return auth
}
~~~

ApiBearerAuth 只控制 Swagger operation 的锁图标和 Authorization 输入。真正校验仍然是 HybridAuthGuard。

## 8.6 构建和验收

执行：

~~~powershell
vp run "server#build"
~~~

保持 dev server 运行，然后测试无 Token：

~~~powershell
try {
  Invoke-RestMethod -Uri "http://localhost:3000/auth/me"
} catch {
  $_.Exception.Response.StatusCode.value__
}
~~~

应为 401。

再使用步骤 7 保存的 Access Token：

~~~powershell
Invoke-RestMethod -Uri "http://localhost:3000/auth/me" -Headers @{ Authorization = "Bearer $accessToken" }
~~~

应返回当前 userId、sessionId、accountEpoch、sessionVersion 和 tokenId，并经过统一响应包装。

此时现有 /db、/redis 等接口也会默认变成 401，这是全局 Guard 的预期行为。如果某个接口确实公开，显式加 Public，不要让 Guard 默认放行。

## 完成检查点

- register 和 login 无 Token 仍能访问。
- me 无 Token 返回 401。
- me 带合法 JWT 成功。
- 错误签名、错误 issuer、错误 audience 和过期 JWT 都返回 401。
- Bypass 不会跳过 Guard。

# 步骤 9：实现 Refresh Token 单次消费和轮换

## 本步目标

每次调用 refresh 时：

~~~text
旧 Refresh Token active
-> 数据库事务锁定 Token、Family、Session、User
-> 旧 Token 改成 consumed
-> Family generation 加 1
-> 插入新的 Refresh Token hash
-> 返回新 Access JWT
-> Cookie 替换成新的 Refresh Token
~~~

如果再次使用已经 consumed 的旧 Token：

~~~text
Family -> compromised
Session -> revoked
Session version + 1
所有 active Refresh Token -> revoked
事务提交
写 Redis revoked tombstone
最后才返回 401
~~~

特别注意：发现重放以后，不能在数据库事务内部直接 throw。直接 throw 会让刚执行的撤销更新一起回滚。

### 为什么还要按 sid 串行化

只给 Refresh Token 行加 `FOR UPDATE` 还不够。Refresh 通常从 Token、Family 开始查，logout 或管理员踢人通常从 Session 开始查。如果各条命令直接按自己的查询入口加行锁，就可能形成相反的锁顺序：

~~~text
Refresh：已经锁住 Token，等待 Session
logout： 已经锁住 Session，等待 Token

结果：死锁；或者依赖数据库偶然的加锁顺序，无法清楚定义谁先发生
~~~

所以 advisory lock 的作用不是代替数据库行锁，也不是解决“最后提交覆盖”，而是让所有改变同一个 Session 的事务先经过同一个入口，统一锁顺序并明确事务先后。

本教程规定：**凡是会改变单个 Session 状态的事务，都先按同一个 sessionId 获取 PostgreSQL 事务级 advisory lock，然后再重新读取并锁定真实数据行。**

第一次通过 Token hash 查询只能用来定位 sid。下面两条映射从创建到过期必须保持不可修改：

~~~text
refresh_tokens.family_id
refresh_token_families.session_id
~~~

不要通过 UPDATE 把已有 Token 或 Family 迁移到另一个 Session。确实需要重新绑定时，创建新的 Session、Family 和 Token，再撤销旧记录。否则第一次定位出来的 sid 可能在等待锁期间变化，事务就会锁错对象。

统一协议如下：

~~~text
锁键：auth-session:<sid>

Refresh：
  Token hash 只用于找到不可变的 sid
  -> advisory lock(sid)
  -> 重新读取 Token + Family + Session + User，并 FOR UPDATE
  -> 根据重读结果轮换或判定重放

logout / 管理员踢人：
  已知 sid
  -> advisory lock(sid)
  -> 重新读取 Session，并 FOR UPDATE
  -> 撤销 Session + Family + active Refresh Token
~~~

这里使用 `auth-session:` 前缀隔离 advisory-lock 命名空间。锁会随 PostgreSQL 事务提交或回滚自动释放，不要手动 unlock。

advisory lock 只协调所有**遵守这套协议**的代码，所以后面的 `FOR UPDATE` 和带旧状态、旧版本的 CAS 仍然要保留。它也不会让 Refresh 变成幂等操作：两个并发 Refresh 仍会串行成“一次轮换成功、另一次被识别为 reuse”，因此前端 single-flight 仍然不可省。

本教程按 PostgreSQL 默认的 `READ COMMITTED` 隔离级别编写：拿到 advisory lock 后重新查询，可以读取前一个事务已经提交的最新状态。如果你把事务改成 `REPEATABLE READ` 或 `SERIALIZABLE`，必须对 SQLSTATE `40001` 的 serialization failure 做有上限的整笔事务重试，例如最多 3 次并加入短随机退避；不能只重试事务中的某一条 UPDATE。

## 9.1 扩展 AuthRepository

将：

~~~text
apps/server/src/modules/auth/auth.repository.ts
~~~

替换成下面的完整版本。这个版本同时提前加入后续退出和改密需要的方法，避免连续几步反复重写 Repository。

~~~ts
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import {
  authSessions,
  refreshTokenFamilies,
  refreshTokens,
  users,
} from '@/database/schema'

@Injectable()
export class AuthRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  findUserByEmail(email: string) {
    return this.db.query.users.findFirst({
      where: eq(users.email, email),
    })
  }

  findUserById(userId: number) {
    return this.db.query.users.findFirst({
      where: eq(users.id, userId),
    })
  }

  async createUser(input: {
    name: string
    email: string
    passwordHash: string
  }) {
    const [user] = await this.db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
      })
      .returning()

    return user
  }

  createLoginSession(input: {
    userId: number
    accountEpoch: number
    refreshTokenHash: string
    expiresAt: Date
    ip?: string
    userAgent?: string
  }) {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .insert(authSessions)
        .values({
          userId: input.userId,
          expiresAt: input.expiresAt,
          ip: input.ip,
          userAgent: input.userAgent,
        })
        .returning()

      const [family] = await tx
        .insert(refreshTokenFamilies)
        .values({
          sessionId: session.id,
          accountEpochAtCreate: input.accountEpoch,
          currentGeneration: 1,
          expiresAt: input.expiresAt,
        })
        .returning()

      await tx.insert(refreshTokens).values({
        familyId: family.id,
        tokenHash: input.refreshTokenHash,
        generation: 1,
        expiresAt: input.expiresAt,
      })

      return session
    })
  }

  rotateRefreshToken(input: {
    currentTokenHash: string
    nextTokenHash: string
    now: Date
  }) {
    return this.db.transaction(async (tx) => {
      // 第一次查询只把不可变的 Token -> Family -> sid 映射找出来。
      // 这里读到的 status、version 等状态一律不能用于后续判断。
      const [mapping] = await tx
        .select({
          sessionId: refreshTokenFamilies.sessionId,
        })
        .from(refreshTokens)
        .innerJoin(
          refreshTokenFamilies,
          eq(refreshTokenFamilies.id, refreshTokens.familyId),
        )
        .where(eq(refreshTokens.tokenHash, input.currentTokenHash))
        .limit(1)

      if (!mapping) {
        return { kind: 'invalid' } as const
      }

      // 与 logout、管理员踢人使用完全相同的 sid 锁协议。
      await tx.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`auth-session:${mapping.sessionId}`}, 0::bigint)
        )
      `)

      // 获得锁后必须重读；只有这次查询结果可以参与状态判断。
      const [row] = await tx
        .select({
          tokenId: refreshTokens.id,
          tokenStatus: refreshTokens.status,
          tokenGeneration: refreshTokens.generation,
          tokenExpiresAt: refreshTokens.expiresAt,

          familyId: refreshTokenFamilies.id,
          familyStatus: refreshTokenFamilies.status,
          familyCurrentGeneration: refreshTokenFamilies.currentGeneration,
          familyAccountEpoch: refreshTokenFamilies.accountEpochAtCreate,
          familyExpiresAt: refreshTokenFamilies.expiresAt,

          sessionId: authSessions.id,
          sessionUserId: authSessions.userId,
          sessionStatus: authSessions.status,
          sessionVersion: authSessions.version,
          sessionExpiresAt: authSessions.expiresAt,

          accountStatus: users.status,
          accountEpoch: users.authEpoch,
        })
        .from(refreshTokens)
        .innerJoin(
          refreshTokenFamilies,
          eq(refreshTokenFamilies.id, refreshTokens.familyId),
        )
        .innerJoin(
          authSessions,
          eq(authSessions.id, refreshTokenFamilies.sessionId),
        )
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(
          and(
            eq(refreshTokens.tokenHash, input.currentTokenHash),
            eq(refreshTokenFamilies.sessionId, mapping.sessionId),
          ),
        )
        .for('update')

      if (!row) {
        return { kind: 'invalid' } as const
      }

      if (row.tokenStatus === 'consumed') {
        await tx
          .update(refreshTokenFamilies)
          .set({
            status: 'compromised',
            revokedAt: input.now,
            revokeReason: 'refresh_token_reuse',
            updatedAt: input.now,
          })
          .where(eq(refreshTokenFamilies.id, row.familyId))

        await tx
          .update(refreshTokens)
          .set({
            status: 'revoked',
          })
          .where(
            and(
              eq(refreshTokens.familyId, row.familyId),
              eq(refreshTokens.status, 'active'),
            ),
          )

        const [updatedSession] = await tx
          .update(authSessions)
          .set({
            status: 'revoked',
            version: row.sessionVersion + 1,
            revokedAt: input.now,
            revokeReason: 'refresh_token_reuse',
            updatedAt: input.now,
          })
          .where(
            and(
              eq(authSessions.id, row.sessionId),
              eq(authSessions.status, 'active'),
              eq(authSessions.version, row.sessionVersion),
            ),
          )
          .returning()

        return {
          kind: 'reuse',
          session: {
            sessionId: row.sessionId,
            userId: String(row.sessionUserId),
            status: 'revoked' as const,
            version: updatedSession?.version ?? row.sessionVersion,
            expiresAtMs: row.sessionExpiresAt.getTime(),
          },
        } as const
      }

      const invalidContext =
        row.tokenStatus !== 'active' ||
        row.familyStatus !== 'active' ||
        row.sessionStatus !== 'active' ||
        row.accountStatus !== 'active' ||
        row.tokenExpiresAt <= input.now ||
        row.familyExpiresAt <= input.now ||
        row.sessionExpiresAt <= input.now ||
        row.familyAccountEpoch !== row.accountEpoch ||
        row.tokenGeneration !== row.familyCurrentGeneration

      if (invalidContext) {
        return { kind: 'invalid' } as const
      }

      const [consumed] = await tx
        .update(refreshTokens)
        .set({
          status: 'consumed',
          consumedAt: input.now,
        })
        .where(
          and(
            eq(refreshTokens.id, row.tokenId),
            eq(refreshTokens.status, 'active'),
          ),
        )
        .returning()

      if (!consumed) {
        throw new Error('Refresh Token CAS 状态异常')
      }

      const nextGeneration = row.tokenGeneration + 1

      const [updatedFamily] = await tx
        .update(refreshTokenFamilies)
        .set({
          currentGeneration: nextGeneration,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(refreshTokenFamilies.id, row.familyId),
            eq(refreshTokenFamilies.status, 'active'),
            eq(
              refreshTokenFamilies.currentGeneration,
              row.tokenGeneration,
            ),
          ),
        )
        .returning()

      if (!updatedFamily) {
        throw new Error('Refresh Family CAS 状态异常')
      }

      await tx.insert(refreshTokens).values({
        familyId: row.familyId,
        tokenHash: input.nextTokenHash,
        generation: nextGeneration,
        expiresAt: row.familyExpiresAt,
      })

      return {
        kind: 'rotated',
        account: {
          userId: String(row.sessionUserId),
          status: row.accountStatus,
          epoch: row.accountEpoch,
        },
        session: {
          sessionId: row.sessionId,
          userId: String(row.sessionUserId),
          status: row.sessionStatus,
          version: row.sessionVersion,
          expiresAtMs: row.sessionExpiresAt.getTime(),
        },
      } as const
    })
  }

  revokeSession(input: {
    sessionId: string
    userId?: number
    reason: string
  }) {
    return this.db.transaction(async (tx) => {
      const now = new Date()

      // 必须与 rotateRefreshToken 使用同一个锁键和同一个加锁顺序。
      await tx.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`auth-session:${input.sessionId}`}, 0::bigint)
        )
      `)

      const condition = input.userId
        ? and(
            eq(authSessions.id, input.sessionId),
            eq(authSessions.userId, input.userId),
          )
        : eq(authSessions.id, input.sessionId)

      const [session] = await tx
        .select()
        .from(authSessions)
        .where(condition)
        .for('update')

      if (!session) {
        return null
      }

      let version = session.version

      if (session.status === 'active') {
        const [updatedSession] = await tx
          .update(authSessions)
          .set({
            status: 'revoked',
            version: session.version + 1,
            revokedAt: now,
            revokeReason: input.reason,
            updatedAt: now,
          })
          .where(
            and(
              eq(authSessions.id, session.id),
              eq(authSessions.status, 'active'),
              eq(authSessions.version, session.version),
            ),
          )
          .returning()

        if (!updatedSession) {
          throw new Error('Session 撤销 CAS 状态异常')
        }

        version = updatedSession.version
      }

      const revokedFamilies = await tx
        .update(refreshTokenFamilies)
        .set({
          status: 'revoked',
          revokedAt: now,
          revokeReason: input.reason,
          updatedAt: now,
        })
        .where(
          and(
            eq(refreshTokenFamilies.sessionId, session.id),
            eq(refreshTokenFamilies.status, 'active'),
          ),
        )
        .returning({ id: refreshTokenFamilies.id })

      const familyIds = revokedFamilies.map((family) => family.id)

      if (familyIds.length > 0) {
        await tx
          .update(refreshTokens)
          .set({ status: 'revoked' })
          .where(
            and(
              inArray(refreshTokens.familyId, familyIds),
              eq(refreshTokens.status, 'active'),
            ),
          )
      }

      return {
        sessionId: session.id,
        userId: String(session.userId),
        status: 'revoked' as const,
        version,
        expiresAtMs: session.expiresAt.getTime(),
      }
    })
  }

  bumpAccountEpoch(userId: number) {
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update')

      if (!account) {
        return null
      }

      const [updated] = await tx
        .update(users)
        .set({
          authEpoch: account.authEpoch + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning()

      return updated
    })
  }

  changePassword(input: {
    userId: number
    expectedPasswordHash: string
    nextPasswordHash: string
  }) {
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .for('update')

      if (
        !account ||
        account.status !== 'active' ||
        account.passwordHash !== input.expectedPasswordHash
      ) {
        return null
      }

      const [updated] = await tx
        .update(users)
        .set({
          passwordHash: input.nextPasswordHash,
          passwordChangedAt: new Date(),
          authEpoch: account.authEpoch + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, account.id))
        .returning()

      return updated
    })
  }
}
~~~

## 9.2 在 AuthService 增加 refresh

修改：

~~~text
apps/server/src/modules/auth/auth.service.ts
~~~

把 UnauthorizedException 保留在 import 中，然后在 AuthService 类内增加：

~~~ts
async refresh(rawToken: string | undefined): Promise<IssuedTokenPair> {
  if (!rawToken) {
    throw new UnauthorizedException('缺少 Refresh Token')
  }

  const currentTokenHash = this.refreshTokens.hash(rawToken)
  const nextToken = this.refreshTokens.create()

  const outcome = await this.repository.rotateRefreshToken({
    currentTokenHash,
    nextTokenHash: nextToken.hash,
    now: new Date(),
  })

  if (outcome.kind === 'invalid') {
    throw new UnauthorizedException('Refresh Token 无效或已过期')
  }

  if (outcome.kind === 'reuse') {
    await this.authState.writeThroughSession(outcome.session)

    // 注意：撤销事务已经提交，写 Redis 后才抛 401
    throw new UnauthorizedException(
      'Refresh Token 已被重复使用，请重新登录',
    )
  }

  const access = await this.accessTokens.sign({
    userId: Number(outcome.account.userId),
    sessionId: outcome.session.sessionId,
    accountEpoch: outcome.account.epoch,
    sessionVersion: outcome.session.version,
  })

  return {
    ...access,
    refreshToken: nextToken.raw,
  }
}
~~~

## 9.3 在 Controller 增加 refresh 接口

修改：

~~~text
apps/server/src/modules/auth/auth.controller.ts
~~~

在 Controller 类内增加：

~~~ts
@Public()
@Post('refresh')
async refresh(
  @Req() request: FastifyRequest,
  @Res({ passthrough: true }) reply: FastifyReply,
) {
  const auth = this.config.getOrThrow<AuthConfig>('auth')
  const rawToken = request.cookies[auth.cookieName]
  const result = await this.authService.refresh(rawToken)

  setRefreshCookie(reply, result.refreshToken, auth)

  return {
    accessToken: result.accessToken,
    expiresIn: result.accessExpiresIn,
  }
}
~~~

request.cookies 的类型由 @fastify/cookie 增强。如果 TypeScript 提示 cookies 不存在，先确认 main.ts 已注册插件并且依赖已正确安装。

## 9.4 构建

~~~powershell
vp run "server#build"
~~~

## 9.5 验收正常轮换

重新登录并保存旧 Cookie：

~~~powershell
$web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "auth-test@example.com"; password = "Correct-Horse-Battery-123!" } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/login" -ContentType "application/json" -Body $body -WebSession $web
$oldCookie = $web.Cookies.GetCookies("http://localhost:3000")["refresh_token"].Value

$refresh = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/refresh" -WebSession $web
$newAccessToken = $refresh.data.accessToken
$newCookie = $web.Cookies.GetCookies("http://localhost:3000")["refresh_token"].Value

$oldCookie -eq $newCookie
~~~

最后一行必须是 False。

数据库中应该看到：

- generation 1 状态为 consumed。
- generation 2 状态为 active。
- Family currentGeneration 为 2。
- accountAuthEpoch 和 sessionVersion 都没有因为正常刷新而增加。

## 9.6 验收旧 Token 重放

创建一个只携带旧 Cookie 的新 WebSession：

~~~powershell
$replay = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$cookie = New-Object System.Net.Cookie("refresh_token", $oldCookie, "/auth", "localhost")
$replay.Cookies.Add($cookie)

try {
  Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/refresh" -WebSession $replay
} catch {
  $_.Exception.Response.StatusCode.value__
}
~~~

应返回 401。

此时再使用第一次刷新得到的 newAccessToken 调用 me，也应返回 401，因为重放检测已经把 Session version 增加并写入 Redis。

## 9.7 验收两个 Refresh 并发

用集成测试保存同一枚 Refresh Cookie，同时发出两个 refresh 请求。不要在测试客户端层做 single-flight，因为本项就是验证服务端竞态。

预期：

- 两个事务会在同一个 `auth-session:<sid>` advisory lock 上串行。
- 第一个请求消费旧 Token 并创建下一代 Token。
- 第二个请求获得锁后重读到旧 Token 已 consumed，将其识别为 reuse。
- 最终 Family 为 compromised、Session 为 revoked，不存在 active Refresh Token。
- 即使第一个请求已经拿到 200，它返回的 Access JWT 也会因为随后增加的 sessionVersion 而失效。

## 严格轮换的前端要求

两个并发 refresh 使用同一个旧 Token 时：

- 第一个成功轮换。
- 第二个会被判定为重放。
- 整个 Session 被撤销。

因此浏览器端必须做 refresh single-flight。多标签页可使用 BroadcastChannel 或 navigator.locks 协调。

如果以后要容忍“服务端已经轮换成功，但响应在网络中丢失”，需要额外设计 Idempotency-Key 和 5 至 10 秒 grace。不能仅凭 consumed 状态直接再次返回，因为服务端没有保存新 Refresh Token 原文。

## 完成检查点

- 每个 Refresh Token 只能成功消费一次。
- 正常刷新只增加 generation。
- 旧 Token 重放会提交 Session 撤销，而不是因 throw 回滚。
- 重放后新旧 Access JWT 都失效。
- 两个 Refresh 并发时，一次成功、一次 reuse，最终 Session 被撤销。
- 前端已经规划 single-flight。

# 步骤 10：实现当前设备退出、单设备踢人、退出全部设备和改密

## 本步目标

实现两个不同的失效维度：

~~~text
单设备失效
  Session status -> revoked
  sessionVersion + 1

全部设备失效
  accountAuthEpoch + 1
~~~

退出全部设备和改密不扫描每一个 Session，也不向每个微服务广播每一个 Session。只更新一次账号 epoch，并发送一个账号级事件。

## 10.1 新增改密 DTO

新增：

~~~text
apps/server/src/modules/auth/dto/change-password.dto.ts
~~~

粘贴：

~~~ts
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(12).max(200),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: '新密码不能与当前密码相同',
    path: ['newPassword'],
  })

export class ChangePasswordDto extends createZodDto(
  ChangePasswordSchema,
) {}
~~~

## 10.2 扩展 AuthService

打开：

~~~text
apps/server/src/modules/auth/auth.service.ts
~~~

在 Nest import 中加入 ConflictException：

~~~ts
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
~~~

如果之前已经有 ConflictException，不要重复导入。

在 AuthService 类内增加：

~~~ts
async logoutCurrent(input: {
  userId: string
  sessionId: string
}) {
  const state = await this.repository.revokeSession({
    sessionId: input.sessionId,
    userId: Number(input.userId),
    reason: 'user_logout',
  })

  if (state) {
    await this.authState.writeThroughSession(state)
  }
}

async revokeSessionByAdmin(sessionId: string) {
  const state = await this.repository.revokeSession({
    sessionId,
    reason: 'admin_kick',
  })

  if (state) {
    await this.authState.writeThroughSession(state)
  }

  return state
}

async logoutAll(userId: string) {
  const account = await this.repository.bumpAccountEpoch(Number(userId))

  if (!account) {
    throw new UnauthorizedException('账号不存在')
  }

  await this.authState.writeThroughAccount({
    userId,
    status: account.status,
    epoch: account.authEpoch,
  })
}

async changePassword(input: {
  userId: string
  currentPassword: string
  newPassword: string
}) {
  const account = await this.repository.findUserById(Number(input.userId))
  const matched = await this.passwords.verify(
    account?.passwordHash ?? null,
    input.currentPassword,
  )

  if (
    !account ||
    !account.passwordHash ||
    account.status !== 'active' ||
    !matched
  ) {
    throw new UnauthorizedException('当前密码错误')
  }

  const nextPasswordHash = await this.passwords.hash(input.newPassword)

  const updated = await this.repository.changePassword({
    userId: account.id,
    expectedPasswordHash: account.passwordHash,
    nextPasswordHash,
  })

  if (!updated) {
    throw new ConflictException('密码状态已变化，请重新操作')
  }

  await this.authState.writeThroughAccount({
    userId: input.userId,
    status: updated.status,
    epoch: updated.authEpoch,
  })
}
~~~

revokeSessionByAdmin 只是领域方法。当前项目没有 RBAC，所以不要直接创建一个“任何登录用户都能踢任意 sid”的 Controller。等你有管理员权限 Guard 后，再把这个方法接到管理员接口，并同时使用 StrongAuth。

## 10.3 扩展 AuthController

打开：

~~~text
apps/server/src/modules/auth/auth.controller.ts
~~~

增加 import：

~~~ts
import { CurrentAuth } from '@/common/decorators/current-auth.decorator'
import { StrongAuth } from '@/common/decorators/strong-auth.decorator'
import type { AuthPrincipal } from './auth.types'
import { ChangePasswordDto } from './dto/change-password.dto'
import {
  clearRefreshCookie,
  setRefreshCookie,
} from './http/refresh-cookie'
~~~

如果已有 CurrentAuth、AuthPrincipal 或 setRefreshCookie import，请合并，不要重复。

在 Controller 类内增加：

~~~ts
@StrongAuth()
@ApiBearerAuth('access-token')
@Post('logout')
async logout(
  @CurrentAuth() principal: AuthPrincipal,
  @Res({ passthrough: true }) reply: FastifyReply,
) {
  await this.authService.logoutCurrent(principal)

  const auth = this.config.getOrThrow<AuthConfig>('auth')
  clearRefreshCookie(reply, auth)

  return null
}

@StrongAuth()
@ApiBearerAuth('access-token')
@Post('logout-all')
async logoutAll(
  @CurrentAuth() principal: AuthPrincipal,
  @Res({ passthrough: true }) reply: FastifyReply,
) {
  await this.authService.logoutAll(principal.userId)

  const auth = this.config.getOrThrow<AuthConfig>('auth')
  clearRefreshCookie(reply, auth)

  return null
}

@StrongAuth()
@ApiBearerAuth('access-token')
@Post('change-password')
async changePassword(
  @CurrentAuth() principal: AuthPrincipal,
  @Body() body: ChangePasswordDto,
  @Res({ passthrough: true }) reply: FastifyReply,
) {
  await this.authService.changePassword({
    userId: principal.userId,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  })

  const auth = this.config.getOrThrow<AuthConfig>('auth')
  clearRefreshCookie(reply, auth)

  return null
}
~~~

改密后当前设备也会失效，因为 accountAuthEpoch 已增加。前端收到成功响应后应清空内存 Access Token，并跳转登录页。

如果用户的 Access JWT 已过期，但仍想“退出”，前端至少可以本地清除 Cookie 可见范围内的状态；HttpOnly Cookie 只能由服务端清除。生产产品可以额外提供一个基于 Refresh Cookie 的公开 logout 端点，但该端点必须通过 Refresh Token hash 定位并撤销 Session，不能只清 Cookie。

## 10.4 构建

~~~powershell
vp run "server#build"
~~~

## 10.5 验收单设备退出

分别创建两个 WebSession 并登录同一个账号：

~~~powershell
$web1 = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$web2 = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ email = "auth-test@example.com"; password = "Correct-Horse-Battery-123!" } | ConvertTo-Json

$login1 = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/login" -ContentType "application/json" -Body $body -WebSession $web1
$login2 = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/login" -ContentType "application/json" -Body $body -WebSession $web2

$token1 = $login1.data.accessToken
$token2 = $login2.data.accessToken
~~~

退出第一个 Session：

~~~powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/logout" -Headers @{ Authorization = "Bearer $token1" } -WebSession $web1
~~~

然后分别调用 me：

~~~powershell
try {
  Invoke-RestMethod -Uri "http://localhost:3000/auth/me" -Headers @{ Authorization = "Bearer $token1" }
} catch {
  $_.Exception.Response.StatusCode.value__
}

Invoke-RestMethod -Uri "http://localhost:3000/auth/me" -Headers @{ Authorization = "Bearer $token2" }
~~~

预期：

- token1 返回 401。
- token2 仍然成功。
- 第一个 Session version 增加 1。
- 第二个 Session version 不变。

## 10.6 验收退出全部设备

使用仍有效的 token2：

~~~powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/logout-all" -Headers @{ Authorization = "Bearer $token2" } -WebSession $web2
~~~

预期：

- users.auth_epoch 只增加 1。
- 所有旧 Access JWT 在下一次强校验时返回 401。
- 所有旧 Refresh Family 因 accountEpochAtCreate 与 users.auth_epoch 不相等而无法刷新。
- 不需要逐条修改所有 Session。

数据库里的旧 Family 可以暂时保持 active，但已经无法通过 refresh 校验。后续定时清理任务可以把这些过期或旧 epoch Family 批量标记为 revoked。

## 10.7 验收改密

先重新登录并明确取得一枚新的 Access Token。不要继续复用步骤 9 或步骤 10.6 中已经被撤销的变量：

~~~powershell
$webChange = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{
  email = "auth-test@example.com"
  password = "Correct-Horse-Battery-123!"
} | ConvertTo-Json

$loginForChange = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/login" -ContentType "application/json" -Body $loginBody -WebSession $webChange
$accessTokenForChange = $loginForChange.data.accessToken

$changeBody = @{
  currentPassword = "Correct-Horse-Battery-123!"
  newPassword = "New-Correct-Horse-Battery-456!"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/change-password" -ContentType "application/json" -Body $changeBody -Headers @{ Authorization = "Bearer $accessTokenForChange" } -WebSession $webChange
~~~

预期：

- password_hash 和 auth_epoch 在一个数据库事务内更新。
- 旧密码不能再登录。
- 新密码可以登录。
- 所有旧 Access JWT 和 Refresh Family 失效。
- 只更新一次账号 epoch，没有按 Session 数量广播。

## 10.8 验收 Refresh 与退出、踢人并发

这三条路径必须使用同一个 sid。集成测试中用事务栅栏或 mock hook 控制谁先拿到 advisory lock，分别覆盖下面两种顺序：

### logout 或管理员踢人先获得锁

预期：

- Refresh 等待撤销事务提交。
- Refresh 获得锁后重新查询，看到 Session、Family 或 Token 已 revoked，返回 invalid。
- 不创建下一代 Refresh Token。

### Refresh 先获得锁

预期：

- Refresh 先完成旧 Token 消费和新 Token 插入。
- logout 或管理员踢人随后获得锁并重读最新状态。
- 撤销事务把 Session、Family，以及 Refresh 刚创建的 active Token 一并撤销。
- Refresh 即使已经返回 200，其 Access JWT 在撤销提交后也不能再通过 strong 校验。

两个顺序的最终状态必须相同：目标 Session 已 revoked、sessionVersion 只增加一次、该 Family 下不存在 active Refresh Token。管理员接口尚未接 RBAC Controller 时，直接针对 `revokeSessionByAdmin` 做服务层或集成测试。

## 到这里先停一次

此时系统已经正确，但每个受保护请求都会读取 Redis。

先确认登录、刷新、重放、单设备退出、全部设备退出和改密全部通过，再进入下一步的性能优化。

## 完成检查点

- 单设备失效使用 sessionVersion。
- 全部设备失效使用 accountAuthEpoch。
- 改密不会逐 Session 更新或广播。
- 管理员踢人领域方法存在，但没有暴露不安全的无权限接口。
- Refresh、当前设备退出和管理员踢人遵守同一个 sid 锁协议。
- Refresh 与撤销无论谁先拿锁，最终都不会遗留 active Refresh Token。
- 强校验闭环全部通过。

# 步骤 11：加入 30 秒 L1 缓存，并把普通接口改成 bounded

## 本步目标

只有现在才开始性能优化：

- 普通接口默认读取本进程 L1 缓存。
- L1 最多存活 30 秒。
- StrongAuth 完全绕过 L1，每次 Pull Redis。
- JWT claim 比缓存版本新时，强制 Pull，不能把新 JWT 错判为旧 Token。
- Redis 不可用时，只有仍在 TTL 内的干净缓存可以继续服务普通接口。
- cache miss、dirty 或过期时 Redis 又不可用，返回 503。

## 11.1 安装 LRU 依赖

执行：

~~~powershell
vp add lru-cache --filter server --save-catalog
~~~

不要使用无限增长的 Map 作为用户缓存。

## 11.2 替换 AuthStateService

把：

~~~text
apps/server/src/modules/auth/state/auth-state.service.ts
~~~

替换成下面完整代码：

~~~ts
import { InjectRedis } from '@nestjs-modules/ioredis'
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { and, eq } from 'drizzle-orm'
import type Redis from 'ioredis'
import { LRUCache } from 'lru-cache'
import type { AuthConsistency } from '@/common/constants/auth'
import type { AuthConfig } from '@/config/auth.config'
import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import { authSessions, users } from '@/database/schema'
import type {
  AccessTokenClaims,
  AccountAuthState,
  AuthStateSnapshot,
  SessionAuthState,
} from '../auth.types'

interface CacheEntry<T> {
  value: T
  dirty: boolean
  versionFloor: number
}

interface PullFence {
  references: number
  versionFloor: number
}

type ProjectionWriteResult = 'applied' | 'identical' | 'stale'

const READ_AUTH_STATE_LUA = [
  "local accountEpoch = redis.call('HGET', KEYS[1], 'epoch') or ''",
  "local accountStatus = redis.call('HGET', KEYS[1], 'status') or ''",
  "local sessionVersion = redis.call('HGET', KEYS[2], 'version') or ''",
  "local sessionStatus = redis.call('HGET', KEYS[2], 'status') or ''",
  "local sessionUserId = redis.call('HGET', KEYS[2], 'userId') or ''",
  "local sessionExpiresAtMs = redis.call('HGET', KEYS[2], 'expiresAtMs') or ''",
  'return {',
  '  accountEpoch,',
  '  accountStatus,',
  '  sessionVersion,',
  '  sessionStatus,',
  '  sessionUserId,',
  '  sessionExpiresAtMs',
  '}',
].join('\n')

const ACCOUNT_PROJECTION_LUA = [
  "local currentEpoch = redis.call('HGET', KEYS[1], 'epoch')",
  'local incomingEpoch = tonumber(ARGV[1])',
  '',
  'if not incomingEpoch then',
  '  return -2',
  'end',
  '',
  "if ARGV[2] ~= 'active'",
  "  and ARGV[2] ~= 'locked'",
  "  and ARGV[2] ~= 'disabled' then",
  '  return -2',
  'end',
  '',
  'if not currentEpoch then',
  "  if redis.call('EXISTS', KEYS[1]) == 1 then",
  '    return -2',
  '  end',
  'else',
  '  local parsedCurrentEpoch = tonumber(currentEpoch)',
  "  local currentStatus = redis.call('HGET', KEYS[1], 'status')",
  '',
  '  if not parsedCurrentEpoch',
  '    or not currentStatus',
  "    or (currentStatus ~= 'active'",
  "      and currentStatus ~= 'locked'",
  "      and currentStatus ~= 'disabled') then",
  '    return -2',
  '  end',
  '',
  '  if parsedCurrentEpoch > incomingEpoch then',
  '    return 0',
  '  end',
  '',
  '  if parsedCurrentEpoch == incomingEpoch then',
  '    if currentStatus == ARGV[2] then',
  '      return 2',
  '    end',
  '',
  '    return -1',
  '  end',
  'end',
  '',
  "redis.call('HSET', KEYS[1],",
  "  'epoch', ARGV[1],",
  "  'status', ARGV[2])",
  'return 1',
].join('\n')

const SESSION_PROJECTION_LUA = [
  "local currentVersion = redis.call('HGET', KEYS[1], 'version')",
  'local incomingVersion = tonumber(ARGV[1])',
  'local expiresAtMs = tonumber(ARGV[4])',
  'local ttlSeconds = tonumber(ARGV[5])',
  '',
  'if not incomingVersion',
  '  or not expiresAtMs',
  '  or not ttlSeconds',
  '  or ttlSeconds <= 0',
  "  or ARGV[3] == ''",
  "  or (ARGV[2] ~= 'active' and ARGV[2] ~= 'revoked') then",
  '  return -2',
  'end',
  '',
  'if not currentVersion then',
  "  if redis.call('EXISTS', KEYS[1]) == 1 then",
  '    return -2',
  '  end',
  'else',
  '  local parsedCurrentVersion = tonumber(currentVersion)',
  "  local currentStatus = redis.call('HGET', KEYS[1], 'status')",
  "  local currentUserId = redis.call('HGET', KEYS[1], 'userId')",
  "  local currentExpiresAtMs = redis.call('HGET', KEYS[1], 'expiresAtMs')",
  '',
  '  if not parsedCurrentVersion',
  '    or not currentStatus',
  '    or not currentUserId',
  '    or not currentExpiresAtMs',
  "    or (currentStatus ~= 'active'",
  "      and currentStatus ~= 'revoked') then",
  '    return -2',
  '  end',
  '',
  '  if parsedCurrentVersion > incomingVersion then',
  '    return 0',
  '  end',
  '',
  '  if parsedCurrentVersion == incomingVersion then',
  '    if currentStatus == ARGV[2]',
  '      and currentUserId == ARGV[3]',
  '      and currentExpiresAtMs == ARGV[4] then',
  "      redis.call('EXPIRE', KEYS[1], ttlSeconds)",
  '      return 2',
  '    end',
  '',
  '    return -1',
  '  end',
  '',
  "  if currentStatus == 'revoked' and ARGV[2] == 'active' then",
  '    return -1',
  '  end',
  'end',
  '',
  "redis.call('HSET', KEYS[1],",
  "  'version', ARGV[1],",
  "  'status', ARGV[2],",
  "  'userId', ARGV[3],",
  "  'expiresAtMs', ARGV[4])",
  "redis.call('EXPIRE', KEYS[1], ttlSeconds)",
  'return 1',
].join('\n')

function accountKey(userId: string) {
  return 'auth:account:{' + userId + '}'
}

function sessionKey(userId: string, sessionId: string) {
  return 'auth:session:{' + userId + '}:' + sessionId
}

function sessionCacheKey(userId: string, sessionId: string) {
  return userId + ':' + sessionId
}

function singleFlightKey(claims: AccessTokenClaims) {
  return [
    claims.sub,
    claims.sid,
    String(claims.ae),
    String(claims.sv),
  ].join(':')
}

@Injectable()
export class AuthStateService {
  private readonly accountCache: LRUCache<
    string,
    CacheEntry<AccountAuthState>
  >

  private readonly sessionCache: LRUCache<
    string,
    CacheEntry<SessionAuthState>
  >

  private readonly inFlight = new Map<
    string,
    Promise<AuthStateSnapshot>
  >()

  private readonly accountPullFences = new Map<string, PullFence>()
  private readonly sessionPullFences = new Map<string, PullFence>()

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ConfigService,
  ) {
    const auth = config.getOrThrow<AuthConfig>('auth')

    this.accountCache = new LRUCache({
      max: 100_000,
      ttl: auth.localCacheTtlMs,
      updateAgeOnGet: false,
    })

    this.sessionCache = new LRUCache({
      max: 200_000,
      ttl: auth.localCacheTtlMs,
      updateAgeOnGet: false,
    })
  }

  async verify(
    claims: AccessTokenClaims,
    consistency: AuthConsistency,
  ) {
    const snapshot =
      consistency === 'strong'
        ? await this.pullSnapshot(claims)
        : await this.getBoundedSnapshot(claims)

    this.assertAllowed(snapshot, claims)
  }

  async writeThroughAccount(state: AccountAuthState) {
    try {
      const result = await this.projectAccount(state)

      if (result === 'stale') {
        throw new ServiceUnavailableException(
          '账号鉴权状态已经存在更高版本',
        )
      }

      const entry = this.mergeAccountCache(state)

      if (entry.versionFloor > state.epoch) {
        throw new ServiceUnavailableException(
          '账号鉴权状态正在发生并发变化',
        )
      }
    } catch (error) {
      this.accountCache.delete(state.userId)
      throw error
    }
  }

  async writeThroughSession(state: SessionAuthState) {
    const key = sessionCacheKey(state.userId, state.sessionId)

    try {
      const result = await this.projectSession(state)

      if (result === 'stale') {
        throw new ServiceUnavailableException(
          'Session 鉴权状态已经存在更高版本',
        )
      }

      const entry = this.mergeSessionCache(state)

      if (entry.versionFloor > state.version) {
        throw new ServiceUnavailableException(
          'Session 鉴权状态正在发生并发变化',
        )
      }
    } catch (error) {
      this.sessionCache.delete(key)
      throw error
    }
  }

  markAccountDirty(userId: string, version: number) {
    const fence = this.accountPullFences.get(userId)

    if (fence) {
      fence.versionFloor = Math.max(fence.versionFloor, version)
    }

    const entry = this.accountCache.peek(userId)

    if (!entry) {
      return
    }

    entry.versionFloor = Math.max(entry.versionFloor, version)
    entry.dirty = entry.versionFloor > entry.value.epoch
  }

  markSessionDirty(
    userId: string,
    sessionId: string,
    version: number,
  ) {
    const key = sessionCacheKey(userId, sessionId)
    const fence = this.sessionPullFences.get(key)

    if (fence) {
      fence.versionFloor = Math.max(fence.versionFloor, version)
    }

    const entry = this.sessionCache.peek(key)

    if (!entry) {
      return
    }

    entry.versionFloor = Math.max(entry.versionFloor, version)
    entry.dirty = entry.versionFloor > entry.value.version
  }

  private async getBoundedSnapshot(
    claims: AccessTokenClaims,
  ): Promise<AuthStateSnapshot> {
    const account = this.accountCache.get(claims.sub)
    const session = this.sessionCache.get(
      sessionCacheKey(claims.sub, claims.sid),
    )

    if (
      account &&
      (account.value.epoch > claims.ae ||
        account.versionFloor > claims.ae)
    ) {
      throw new UnauthorizedException('登录状态已失效')
    }

    if (
      session &&
      (session.value.version > claims.sv ||
        session.versionFloor > claims.sv)
    ) {
      throw new UnauthorizedException('登录状态已失效')
    }

    if (
      account &&
      session &&
      !account.dirty &&
      !session.dirty &&
      account.value.epoch === claims.ae &&
      session.value.version === claims.sv
    ) {
      return {
        account: account.value,
        session: session.value,
      }
    }

    return this.pullSnapshotSingleFlight(claims)
  }

  private pullSnapshotSingleFlight(
    claims: AccessTokenClaims,
  ): Promise<AuthStateSnapshot> {
    const key = singleFlightKey(claims)
    const existing = this.inFlight.get(key)

    if (existing) {
      return existing
    }

    const task = this.pullSnapshot(claims).finally(() => {
      this.inFlight.delete(key)
    })

    this.inFlight.set(key, task)
    return task
  }

  private async pullSnapshot(
    claims: AccessTokenClaims,
  ): Promise<AuthStateSnapshot> {
    const sessionCacheId = sessionCacheKey(
      claims.sub,
      claims.sid,
    )

    const accountFence = this.acquireFence(
      this.accountPullFences,
      claims.sub,
      this.accountCache.peek(claims.sub)?.versionFloor ?? 0,
    )

    const sessionFence = this.acquireFence(
      this.sessionPullFences,
      sessionCacheId,
      this.sessionCache.peek(sessionCacheId)?.versionFloor ?? 0,
    )

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const shared = await this.readShared(
          claims.sub,
          claims.sid,
        )

        const accountEntry = shared.account
          ? this.mergeAccountCache(shared.account)
          : this.accountCache.peek(claims.sub)

        const sessionEntry = shared.session
          ? this.mergeSessionCache(shared.session)
          : this.sessionCache.peek(sessionCacheId)

        this.throwIfKnownVersionIsNewer(
          claims,
          accountEntry,
          sessionEntry,
          accountFence,
          sessionFence,
        )

        if (
          shared.account &&
          shared.session &&
          this.snapshotCoversKnownFloors(
            {
              account: shared.account,
              session: shared.session,
            },
            claims,
            accountEntry,
            sessionEntry,
            accountFence,
            sessionFence,
          )
        ) {
          return {
            account: shared.account,
            session: shared.session,
          }
        }

        const database = await this.loadDatabaseSnapshot(
          claims.sub,
          claims.sid,
        )

        if (!database) {
          throw new UnauthorizedException('登录状态不存在')
        }

        if (
          database.account.epoch < claims.ae ||
          database.session.version < claims.sv
        ) {
          throw new ServiceUnavailableException(
            '鉴权事实库版本落后于 JWT',
          )
        }

        let accountProjection: ProjectionWriteResult
        let sessionProjection: ProjectionWriteResult

        try {
          ;[accountProjection, sessionProjection] =
            await Promise.all([
              this.projectAccount(database.account),
              this.projectSession(database.session),
            ])
        } catch (error) {
          this.accountCache.delete(claims.sub)
          this.sessionCache.delete(sessionCacheId)
          throw error
        }

        if (
          accountProjection === 'stale' ||
          sessionProjection === 'stale'
        ) {
          continue
        }

        const cached = this.mergeSnapshot(database)

        this.throwIfKnownVersionIsNewer(
          claims,
          cached.account,
          cached.session,
          accountFence,
          sessionFence,
        )

        if (
          this.snapshotCoversKnownFloors(
            database,
            claims,
            cached.account,
            cached.session,
            accountFence,
            sessionFence,
          )
        ) {
          return database
        }
      }

      throw new ServiceUnavailableException(
        '鉴权状态正在变化，请稍后重试',
      )
    } finally {
      this.releaseFence(
        this.accountPullFences,
        claims.sub,
        accountFence,
      )

      this.releaseFence(
        this.sessionPullFences,
        sessionCacheId,
        sessionFence,
      )
    }
  }

  private async readShared(
    userId: string,
    sessionId: string,
  ): Promise<{
    account: AccountAuthState | null
    session: SessionAuthState | null
  }> {
    try {
      const raw = await this.redis.eval(
        READ_AUTH_STATE_LUA,
        2,
        accountKey(userId),
        sessionKey(userId, sessionId),
      )

      if (!Array.isArray(raw) || raw.length !== 6) {
        throw new Error('Redis Auth State 返回结构错误')
      }

      const [
        accountEpoch,
        accountStatus,
        sessionVersion,
        sessionStatus,
        sessionUserId,
        sessionExpiresAtMs,
      ] = raw.map((value) => String(value ?? ''))

      return {
        account: this.parseAccount(
          userId,
          accountEpoch,
          accountStatus,
        ),
        session: this.parseSession(
          userId,
          sessionId,
          sessionVersion,
          sessionStatus,
          sessionUserId,
          sessionExpiresAtMs,
        ),
      }
    } catch {
      throw new ServiceUnavailableException(
        '共享鉴权状态暂时不可用',
      )
    }
  }

  private async loadDatabaseSnapshot(
    userId: string,
    sessionId: string,
  ): Promise<AuthStateSnapshot | null> {
    const numericUserId = Number(userId)

    if (
      !Number.isSafeInteger(numericUserId) ||
      numericUserId <= 0
    ) {
      return null
    }

    try {
      const [row] = await this.db
        .select({
          accountStatus: users.status,
          accountEpoch: users.authEpoch,
          sessionId: authSessions.id,
          sessionUserId: authSessions.userId,
          sessionStatus: authSessions.status,
          sessionVersion: authSessions.version,
          sessionExpiresAt: authSessions.expiresAt,
        })
        .from(users)
        .innerJoin(
          authSessions,
          and(
            eq(authSessions.userId, users.id),
            eq(authSessions.id, sessionId),
          ),
        )
        .where(eq(users.id, numericUserId))
        .limit(1)

      if (!row) {
        return null
      }

      return {
        account: {
          userId,
          status: row.accountStatus,
          epoch: row.accountEpoch,
        },
        session: {
          sessionId: row.sessionId,
          userId: String(row.sessionUserId),
          status: row.sessionStatus,
          version: row.sessionVersion,
          expiresAtMs: row.sessionExpiresAt.getTime(),
        },
      }
    } catch {
      throw new ServiceUnavailableException(
        '鉴权事实库暂时不可用',
      )
    }
  }

  private async projectAccount(
    state: AccountAuthState,
  ): Promise<ProjectionWriteResult> {
    let raw: unknown

    try {
      raw = await this.redis.eval(
        ACCOUNT_PROJECTION_LUA,
        1,
        accountKey(state.userId),
        String(state.epoch),
        state.status,
      )
    } catch {
      throw new ServiceUnavailableException(
        '账号鉴权状态暂时不可用',
      )
    }

    return this.decodeProjectionResult(raw, '账号')
  }

  private async projectSession(
    state: SessionAuthState,
  ): Promise<ProjectionWriteResult> {
    const auth = this.config.getOrThrow<AuthConfig>('auth')
    const activeTtl = Math.ceil(
      (state.expiresAtMs - Date.now()) / 1000,
    )

    const ttlSeconds =
      state.status === 'revoked'
        ? auth.tombstoneTtlSeconds
        : Math.max(
            activeTtl,
            auth.tombstoneTtlSeconds,
          )

    let raw: unknown

    try {
      raw = await this.redis.eval(
        SESSION_PROJECTION_LUA,
        1,
        sessionKey(state.userId, state.sessionId),
        String(state.version),
        state.status,
        state.userId,
        String(state.expiresAtMs),
        String(ttlSeconds),
      )
    } catch {
      throw new ServiceUnavailableException(
        'Session 鉴权状态暂时不可用',
      )
    }

    return this.decodeProjectionResult(raw, 'Session')
  }

  private decodeProjectionResult(
    raw: unknown,
    aggregateName: string,
  ): ProjectionWriteResult {
    const code = Number(raw)

    if (code === 1) {
      return 'applied'
    }

    if (code === 2) {
      return 'identical'
    }

    if (code === 0) {
      return 'stale'
    }

    throw new ServiceUnavailableException(
      aggregateName + '鉴权状态存在版本冲突',
    )
  }

  private mergeSnapshot(snapshot: AuthStateSnapshot) {
    return {
      account: this.mergeAccountCache(snapshot.account),
      session: this.mergeSessionCache(snapshot.session),
    }
  }

  private mergeAccountCache(
    state: AccountAuthState,
  ): CacheEntry<AccountAuthState> {
    const previous = this.accountCache.peek(state.userId)
    const fenceFloor =
      this.accountPullFences.get(state.userId)?.versionFloor ?? 0

    if (previous && previous.value.epoch > state.epoch) {
      previous.versionFloor = Math.max(
        previous.versionFloor,
        previous.value.epoch,
        fenceFloor,
      )
      previous.dirty =
        previous.versionFloor > previous.value.epoch

      return previous
    }

    if (
      previous &&
      previous.value.epoch === state.epoch &&
      (previous.value.userId !== state.userId ||
        previous.value.status !== state.status)
    ) {
      this.accountCache.delete(state.userId)

      throw new ServiceUnavailableException(
        'L1 账号状态出现同版本冲突',
      )
    }

    const versionFloor = Math.max(
      previous?.versionFloor ?? 0,
      fenceFloor,
      state.epoch,
    )

    const entry: CacheEntry<AccountAuthState> = {
      value: state,
      versionFloor,
      dirty: versionFloor > state.epoch,
    }

    this.accountCache.set(state.userId, entry)
    return entry
  }

  private mergeSessionCache(
    state: SessionAuthState,
  ): CacheEntry<SessionAuthState> {
    const key = sessionCacheKey(
      state.userId,
      state.sessionId,
    )

    const previous = this.sessionCache.peek(key)
    const fenceFloor =
      this.sessionPullFences.get(key)?.versionFloor ?? 0

    if (previous && previous.value.version > state.version) {
      previous.versionFloor = Math.max(
        previous.versionFloor,
        previous.value.version,
        fenceFloor,
      )
      previous.dirty =
        previous.versionFloor > previous.value.version

      return previous
    }

    if (
      previous &&
      previous.value.version === state.version &&
      (previous.value.sessionId !== state.sessionId ||
        previous.value.userId !== state.userId ||
        previous.value.status !== state.status ||
        previous.value.expiresAtMs !== state.expiresAtMs)
    ) {
      this.sessionCache.delete(key)

      throw new ServiceUnavailableException(
        'L1 Session 状态出现同版本冲突',
      )
    }

    if (
      previous?.value.status === 'revoked' &&
      state.status === 'active'
    ) {
      this.sessionCache.delete(key)

      throw new ServiceUnavailableException(
        '禁止恢复已经撤销的 Session',
      )
    }

    const versionFloor = Math.max(
      previous?.versionFloor ?? 0,
      fenceFloor,
      state.version,
    )

    const entry: CacheEntry<SessionAuthState> = {
      value: state,
      versionFloor,
      dirty: versionFloor > state.version,
    }

    this.sessionCache.set(key, entry)
    return entry
  }

  private throwIfKnownVersionIsNewer(
    claims: AccessTokenClaims,
    account: CacheEntry<AccountAuthState> | undefined,
    session: CacheEntry<SessionAuthState> | undefined,
    accountFence: PullFence,
    sessionFence: PullFence,
  ) {
    const accountFloor = Math.max(
      account?.versionFloor ?? 0,
      accountFence.versionFloor,
    )

    const sessionFloor = Math.max(
      session?.versionFloor ?? 0,
      sessionFence.versionFloor,
    )

    if (
      accountFloor > claims.ae ||
      sessionFloor > claims.sv
    ) {
      throw new UnauthorizedException('登录状态已失效')
    }
  }

  private snapshotCoversKnownFloors(
    snapshot: AuthStateSnapshot,
    claims: AccessTokenClaims,
    account: CacheEntry<AccountAuthState> | undefined,
    session: CacheEntry<SessionAuthState> | undefined,
    accountFence: PullFence,
    sessionFence: PullFence,
  ) {
    const accountFloor = Math.max(
      account?.versionFloor ?? 0,
      accountFence.versionFloor,
    )

    const sessionFloor = Math.max(
      session?.versionFloor ?? 0,
      sessionFence.versionFloor,
    )

    return (
      snapshot.account.epoch >= claims.ae &&
      snapshot.session.version >= claims.sv &&
      accountFloor <= snapshot.account.epoch &&
      sessionFloor <= snapshot.session.version
    )
  }

  private acquireFence(
    map: Map<string, PullFence>,
    key: string,
    initialFloor: number,
  ) {
    const existing = map.get(key)

    if (existing) {
      existing.references += 1
      existing.versionFloor = Math.max(
        existing.versionFloor,
        initialFloor,
      )

      return existing
    }

    const fence: PullFence = {
      references: 1,
      versionFloor: initialFloor,
    }

    map.set(key, fence)
    return fence
  }

  private releaseFence(
    map: Map<string, PullFence>,
    key: string,
    fence: PullFence,
  ) {
    const current = map.get(key)

    if (current !== fence) {
      return
    }

    current.references -= 1

    if (current.references === 0) {
      map.delete(key)
    }
  }

  private parseAccount(
    userId: string,
    epochRaw: string,
    statusRaw: string,
  ): AccountAuthState | null {
    const epoch = Number(epochRaw)

    if (
      !Number.isSafeInteger(epoch) ||
      epoch < 1 ||
      !['active', 'locked', 'disabled'].includes(statusRaw)
    ) {
      return null
    }

    return {
      userId,
      status: statusRaw as AccountAuthState['status'],
      epoch,
    }
  }

  private parseSession(
    expectedUserId: string,
    sessionId: string,
    versionRaw: string,
    statusRaw: string,
    userIdRaw: string,
    expiresAtMsRaw: string,
  ): SessionAuthState | null {
    const version = Number(versionRaw)
    const expiresAtMs = Number(expiresAtMsRaw)

    if (
      userIdRaw !== expectedUserId ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      !Number.isSafeInteger(expiresAtMs) ||
      expiresAtMs <= 0 ||
      !['active', 'revoked'].includes(statusRaw)
    ) {
      return null
    }

    return {
      sessionId,
      userId: userIdRaw,
      status: statusRaw as SessionAuthState['status'],
      version,
      expiresAtMs,
    }
  }

  private assertAllowed(
    snapshot: AuthStateSnapshot,
    claims: AccessTokenClaims,
  ) {
    if (
      snapshot.account.epoch < claims.ae ||
      snapshot.session.version < claims.sv
    ) {
      throw new ServiceUnavailableException(
        '鉴权状态投影落后',
      )
    }

    const accepted =
      snapshot.account.status === 'active' &&
      snapshot.session.status === 'active' &&
      snapshot.session.userId === claims.sub &&
      snapshot.account.epoch === claims.ae &&
      snapshot.session.version === claims.sv &&
      snapshot.session.expiresAtMs > Date.now()

    if (!accepted) {
      throw new UnauthorizedException('登录状态已失效')
    }
  }
}
~~~

这版缓存代码必须保留以下行为：

- single-flight key 是 sub + sid + ae + sv，不能只用 sid。
- Pull 第一次读取 Redis 前先注册 fence。
- Pub/Sub 在 L1 不存在但 Pull 正在进行时，也会提高 fence.versionFloor。
- 缓存合并只允许版本单调前进；旧 Pull 不调用 cache.set，因此不能覆盖新缓存或刷新它的 TTL。
- StrongAuth 每次都 Pull Redis，但仍使用 fence 防止 Pull 期间漏掉更高版本事件。
- Redis 只用一次 EVAL 原子读取两个 key，PostgreSQL 只用一条 JOIN。
- Pull 最多重试一次；仍覆盖不了已知 versionFloor 时返回 503。
- Redis 投影成功后才能 publish。否则 fence 可能先知道新版本，却暂时 Pull 不到对应状态。

把以下并发场景加入测试清单；任一失败都不要进入步骤 12：

1. ae=17 与 ae=18 的请求不能共用同一个 single-flight Promise。
2. L1 不存在时暂停 Redis Pull，期间收到 version 18，旧 Pull 不能写成 clean。
3. L1 已知 versionFloor=18 时合并 version 17，floor 必须仍为 18，而且不能刷新 TTL。
4. Redis 已有 version=18、status=revoked，再投影 version=18、status=active，必须返回 503 且 Redis 不变。
5. Redis 已有 revoked/version=18，再投影 active/version=19，也必须返回 503。
6. StrongAuth 的 Redis 监控只出现一次 EVAL，不能出现两次 HGETALL。

## 11.3 把 Guard 默认值改成 bounded

修改：

~~~text
apps/server/src/modules/auth/guards/hybrid-auth.guard.ts
~~~

找到：

~~~ts
) ?? 'strong'
~~~

改成：

~~~ts
) ?? 'bounded'
~~~

现在规则变成：

- 不加装饰器的接口：bounded。
- 加 StrongAuth 的接口：strong。
- 加 Public 的接口：不鉴权。

建议：

| 接口 | 模式 |
| --- | --- |
| 普通列表、详情、搜索 | bounded |
| 修改密码 | strong |
| 退出全部设备 | strong |
| 管理员踢人 | strong |
| 付款、提现、绑定密钥 | strong，并考虑 Recent Auth |
| 登录、注册、刷新 | Public |

写接口不一定全部 strong，但只要操作会扩大权限、转移资产或修改认证状态，就应该 strong。

## 11.4 构建

~~~powershell
vp run "server#build"
~~~

## 11.5 验收 bounded 延迟

要观察本地缓存，启动两个服务实例：

终端 A：

~~~powershell
$env:PORT = "3000"
vp run "server#dev"
~~~

终端 B：

~~~powershell
$env:PORT = "3001"
vp run "server#dev"
~~~

另开第三个 PowerShell，按下面的命令创建 Session，并先调用 A 的普通 me，让 A 写入 L1：

~~~powershell
$boundedWeb = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$boundedBody = @{
  email = "auth-test@example.com"
  password = "New-Correct-Horse-Battery-456!"
} | ConvertTo-Json

$boundedLogin = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/auth/login" -ContentType "application/json" -Body $boundedBody -WebSession $boundedWeb
$boundedToken = $boundedLogin.data.accessToken

Invoke-RestMethod -Uri "http://localhost:3000/auth/me" -Headers @{ Authorization = "Bearer $boundedToken" }
~~~

然后让实例 B 使用同一枚 JWT 撤销这个 Session：

~~~powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/auth/logout" -Headers @{ Authorization = "Bearer $boundedToken" } -WebSession $boundedWeb
~~~

因为此时还没有 Pub/Sub，立刻请求 A 时可能仍然成功：

~~~powershell
try {
  Invoke-RestMethod -Uri "http://localhost:3000/auth/me" -Headers @{ Authorization = "Bearer $boundedToken" }
} catch {
  $_.Exception.Response.StatusCode.value__
}
~~~

等待一个完整 TTL 加少量余量后再次请求：

~~~powershell
Start-Sleep -Seconds 32

try {
  Invoke-RestMethod -Uri "http://localhost:3000/auth/me" -Headers @{ Authorization = "Bearer $boundedToken" }
} catch {
  $_.Exception.Response.StatusCode.value__
}
~~~

第二次必须得到 401。如果 Redis 写入失败、Outbox 尚在恢复或本机调度发生明显暂停，收敛时间还会叠加对应延迟，因此生产监控应记录实际撤销传播时间，不能只观察配置里的 30_000。

要验证 strong，临时在 me 方法上方加 @StrongAuth()，构建并重启两个实例，再重新登录取得一枚新 Token。先在 B 调用 logout，紧接着在 A 调用 me，第一次就必须得到 401。验证后删除 me 上临时添加的 @StrongAuth()，重新构建，保持普通 me 为 bounded。

这里承诺的是“最迟在撤销后的一个 L1 TTL 窗口内开始拒绝”，不是“Pub/Sub 丢失后 TTL 窗口内从第一毫秒就拒绝”。

## 11.6 验收故障策略

在测试环境暂时停止 Redis：

- 已经命中、未过期且未 dirty 的 bounded 缓存可以继续工作到 TTL 结束。
- bounded 的 cache miss、过期或 dirty 请求返回 503。
- StrongAuth 请求立即返回 503。
- 不能因为 Redis 挂了就默认 active。

## 完成检查点

- LRU 有 max 上限。
- bounded 默认 TTL 是 30 秒。
- StrongAuth 不读取 L1。
- JWT 版本比缓存新时会 Pull。
- 共享状态版本比 JWT 新时立即 401。
- Redis 故障不会让未知状态放行。

# 步骤 12：加入 Redis Pub/Sub，Push 只标脏

## 本步目标

让其他服务实例尽快知道某个账号或 Session 已变化，但收到事件时不立即查询 Redis。

流程是：

~~~text
状态修改服务
-> PostgreSQL 提交
-> 同步写 Redis Auth State
-> publish 一个很小的版本事件

其他实例
-> 收到事件
-> 如果本地根本没缓存该用户，忽略
-> 如果本地有旧缓存，标 dirty 和 versionFloor
-> 下一个请求再 Pull
~~~

这就是推拉结合。Push 只传失效提示，Pull 才拿真实状态。

## 12.1 新增事件类型

新增：

~~~text
apps/server/src/modules/auth/state/auth-state.events.ts
~~~

粘贴：

~~~ts
export type AuthStateInvalidationEvent =
  | {
      type: 'account.changed'
      userId: string
      version: number
    }
  | {
      type: 'session.changed'
      userId: string
      sessionId: string
      version: number
    }
~~~

事件不携带密码、Token、完整用户资料或权限列表。

## 12.2 新增 Publisher

新增：

~~~text
apps/server/src/modules/auth/state/auth-state.publisher.ts
~~~

粘贴：

~~~ts
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Redis from 'ioredis'
import type { AuthConfig } from '@/config/auth.config'
import type {
  AccountAuthState,
  SessionAuthState,
} from '../auth.types'
import type { AuthStateInvalidationEvent } from './auth-state.events'

@Injectable()
export class AuthStatePublisher {
  private readonly logger = new Logger(AuthStatePublisher.name)

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  accountChanged(state: AccountAuthState) {
    return this.publish({
      type: 'account.changed',
      userId: state.userId,
      version: state.epoch,
    })
  }

  sessionChanged(state: SessionAuthState) {
    return this.publish({
      type: 'session.changed',
      userId: state.userId,
      sessionId: state.sessionId,
      version: state.version,
    })
  }

  private async publish(event: AuthStateInvalidationEvent) {
    const auth = this.config.getOrThrow<AuthConfig>('auth')

    try {
      await this.redis.publish(
        auth.eventChannel,
        JSON.stringify(event),
      )
    } catch (error) {
      // Redis Auth State 已经同步写入，所以 Pub/Sub 失败不回滚业务。
      // 步骤 13 的 Outbox Worker 会负责重试发布。
      this.logger.warn(
        'Auth State 失效事件发布失败：' + String(error),
      )
    }
  }
}
~~~

## 12.3 新增 Subscriber

新增：

~~~text
apps/server/src/modules/auth/state/auth-state.subscriber.ts
~~~

粘贴：

~~~ts
import { InjectRedis } from '@nestjs-modules/ioredis'
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Redis from 'ioredis'
import type { AuthConfig } from '@/config/auth.config'
import type { AuthStateInvalidationEvent } from './auth-state.events'
import { AuthStateService } from './auth-state.service'

@Injectable()
export class AuthStateSubscriber
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AuthStateSubscriber.name)
  private readonly subscriber: Redis

  constructor(
    @InjectRedis() redis: Redis,
    private readonly authState: AuthStateService,
    private readonly config: ConfigService,
  ) {
    // 订阅连接进入 subscriber mode 后不能再执行普通 Redis 命令
    this.subscriber = redis.duplicate()
  }

  async onModuleInit() {
    const auth = this.config.getOrThrow<AuthConfig>('auth')

    this.subscriber.on('message', (_channel, raw) => {
      this.handleMessage(raw)
    })

    this.subscriber.on('error', (error) => {
      this.logger.error('Auth State 订阅连接错误', error)
    })

    await this.subscriber.subscribe(auth.eventChannel)
  }

  async onModuleDestroy() {
    await this.subscriber.quit()
  }

  private handleMessage(raw: string) {
    try {
      const event = JSON.parse(raw) as AuthStateInvalidationEvent

      if (
        event.type === 'account.changed' &&
        typeof event.userId === 'string' &&
        Number.isSafeInteger(event.version)
      ) {
        this.authState.markAccountDirty(
          event.userId,
          event.version,
        )
        return
      }

      if (
        event.type === 'session.changed' &&
        typeof event.userId === 'string' &&
        typeof event.sessionId === 'string' &&
        Number.isSafeInteger(event.version)
      ) {
        this.authState.markSessionDirty(
          event.userId,
          event.sessionId,
          event.version,
        )
      }
    } catch (error) {
      this.logger.warn('忽略非法 Auth State 事件：' + String(error))
    }
  }
}
~~~

Subscriber 必须使用 redis.duplicate。不能把普通命令连接直接拿去 subscribe。

## 12.4 注册 Publisher 和 Subscriber

修改：

~~~text
apps/server/src/modules/auth/auth.module.ts
~~~

增加 import：

~~~ts
import { AuthStatePublisher } from './state/auth-state.publisher'
import { AuthStateSubscriber } from './state/auth-state.subscriber'
~~~

在 providers 中增加：

~~~ts
AuthStatePublisher,
AuthStateSubscriber,
~~~

## 12.5 让状态修改后发布事件

修改：

~~~text
apps/server/src/modules/auth/auth.service.ts
~~~

增加 import：

~~~ts
import { AuthStatePublisher } from './state/auth-state.publisher'
~~~

在 constructor 增加依赖：

~~~ts
private readonly authEvents: AuthStatePublisher,
~~~

然后完成以下机械修改。

Refresh 重放分支中，在 writeThroughSession 后增加：

~~~ts
await this.authEvents.sessionChanged(outcome.session)
~~~

logoutCurrent 中改为：

~~~ts
if (state) {
  await this.authState.writeThroughSession(state)
  await this.authEvents.sessionChanged(state)
}
~~~

revokeSessionByAdmin 中改为：

~~~ts
if (state) {
  await this.authState.writeThroughSession(state)
  await this.authEvents.sessionChanged(state)
}
~~~

logoutAll 在 writeThroughAccount 后增加：

~~~ts
await this.authEvents.accountChanged({
  userId,
  status: account.status,
  epoch: account.authEpoch,
})
~~~

changePassword 在 writeThroughAccount 后增加：

~~~ts
await this.authEvents.accountChanged({
  userId: input.userId,
  status: updated.status,
  epoch: updated.authEpoch,
})
~~~

登录创建新 Session 时可以不发布，因为其他实例通常没有这个新 sid 的缓存。即使发布，没有缓存的实例也会忽略。

## 12.6 构建

~~~powershell
vp run "server#build"
~~~

## 12.7 两实例验收 Push/Pull

继续使用 3000 和 3001 两个实例：

1. 在实例 A 调用普通 me，让 A 缓存账号和 Session。
2. 在实例 B 撤销该 Session或执行 logout-all。
3. B 先同步写 Redis，再 publish。
4. A 收到事件后只标 dirty 或记录更高 versionFloor。
5. 下一次请求在 TTL 尚未到期时也会立刻拒绝或 Pull。

再暂时让 A 的 subscriber 断线并重复测试：

- A 可能在剩余 TTL 内继续接受旧 JWT。
- 最迟 TTL 到期后，A 会 Pull Redis 并拒绝。

这证明 Pub/Sub 是低延迟优化，TTL Pull 才是漏消息后的正确性兜底。

## 为什么多个用户改密不会造成回源风暴

假设一秒内有 1000 个不同用户改密：

- 每个账号只产生一个很小的 account.changed 事件。
- 某微服务没有缓存该用户时直接忽略。
- 有缓存时只标 dirty，不立刻 Pull。
- 只有该用户下一次真的访问这个微服务时才 Pull。
- 同一个 sid 的并发请求由 single-flight 合并成一次 Pull。

因此广播数量与真实安全变更数量一致，而 Redis Pull 与后续真实访问需求一致，不会让每个服务收到事件就集体访问用户中心。

## 完成检查点

- Subscriber 使用 duplicate 连接。
- Push 只标脏，不立即回源。
- 无本地缓存的用户事件被忽略。
- 乱序旧版本不会降低 versionFloor。
- Pub/Sub 完全丢失时，TTL 仍能最终收敛。

# 步骤 13：加入 Outbox，修复提交后进程崩溃窗口

## 为什么 Pub/Sub 还不够

步骤 12 的快速路径是：

~~~text
PostgreSQL COMMIT
-> 写 Redis
-> publish
~~~

如果进程恰好在 COMMIT 后、写 Redis 前崩溃，数据库已经撤销 Session，但 Redis 仍可能是旧状态。

Outbox 的作用是把“状态改变了”与业务状态放进同一个 PostgreSQL 事务。后台 Worker 即使晚一点运行，也能从数据库恢复 Redis 投影并重新发布事件。

Outbox 保证最终恢复，不代表魔法般的跨 PostgreSQL 和 Redis 单事务。

安全命令仍遵循：

~~~text
1. PostgreSQL 事务更新状态并写 Outbox
2. 提交后同步投影 Redis
3. Redis 确认后，安全命令才向调用方报告成功
4. Pub/Sub 可以 best effort
5. Outbox Worker 负责崩溃恢复和重试
~~~

## 13.1 安装调度依赖

~~~powershell
vp add @nestjs/schedule --filter server --save-catalog
~~~

auth_outbox 表已经在步骤 4 创建，不需要再新增表。

## 13.2 在状态事务内写完整 Outbox 快照

Outbox 不能只保存 aggregateId。否则数据库行以后被物理删除，Worker 无法恢复 revoked 或 disabled tombstone。

### 13.2.1 增加 payload 类型

修改：

~~~text
apps/server/src/modules/auth/auth.types.ts
~~~

在文件末尾增加：

~~~ts
export interface AccountChangedOutboxPayload {
  schemaVersion: 1
  state: AccountAuthState
}

export interface SessionChangedOutboxPayload {
  schemaVersion: 1
  state: SessionAuthState
}
~~~

payload 字段在 schema 中仍然是 unknown。上面的接口用于写入端检查；Worker 读取 JSONB 时仍必须做运行时校验。

### 13.2.2 扩展 Repository import

修改：

~~~text
apps/server/src/modules/auth/auth.repository.ts
~~~

在 schema import 中加入 authOutbox：

~~~ts
import {
  authOutbox,
  authSessions,
  refreshTokenFamilies,
  refreshTokens,
  users,
} from '@/database/schema'
~~~

再增加类型 import：

~~~ts
import type {
  AccountAuthState,
  AccountChangedOutboxPayload,
  SessionAuthState,
  SessionChangedOutboxPayload,
} from './auth.types'
~~~

### 13.2.3 Refresh 重放事务写 Session tombstone

在 rotateRefreshToken 的 consumed 分支中，updatedSession 更新成功后、return reuse 之前增加：

~~~ts
if (updatedSession) {
  const state: SessionAuthState = {
    sessionId: updatedSession.id,
    userId: String(updatedSession.userId),
    status: 'revoked',
    version: updatedSession.version,
    expiresAtMs: updatedSession.expiresAt.getTime(),
  }

  await tx.insert(authOutbox).values({
    eventType: 'session.changed',
    aggregateType: 'session',
    aggregateId: state.sessionId,
    aggregateVersion: state.version,
    payload: {
      schemaVersion: 1,
      state,
    } satisfies SessionChangedOutboxPayload,
  })
}
~~~

只有本事务真的完成 active -> revoked 时才写 Outbox。Session 之前已经 revoked 时，不增加 version，也不制造重复状态事件。

### 13.2.4 单 Session 撤销事务写 tombstone

在 revokeSession 的 session.status === active 分支中，得到 updatedSession 并把 version 赋值后增加：

~~~ts
const state: SessionAuthState = {
  sessionId: updatedSession.id,
  userId: String(updatedSession.userId),
  status: 'revoked',
  version: updatedSession.version,
  expiresAtMs: updatedSession.expiresAt.getTime(),
}

await tx.insert(authOutbox).values({
  eventType: 'session.changed',
  aggregateType: 'session',
  aggregateId: state.sessionId,
  aggregateVersion: state.version,
  payload: {
    schemaVersion: 1,
    state,
  } satisfies SessionChangedOutboxPayload,
})
~~~

这段 insert 和 Session 撤销必须在同一个 tx 回调内。

### 13.2.5 logout-all 写 Account 快照

在 bumpAccountEpoch 中得到 updated 后、return updated 前增加：

~~~ts
const state: AccountAuthState = {
  userId: String(updated.id),
  status: updated.status,
  epoch: updated.authEpoch,
}

await tx.insert(authOutbox).values({
  eventType: 'account.changed',
  aggregateType: 'account',
  aggregateId: state.userId,
  aggregateVersion: state.epoch,
  payload: {
    schemaVersion: 1,
    state,
  } satisfies AccountChangedOutboxPayload,
})
~~~

### 13.2.6 改密写 Account 快照

在 changePassword 中得到 updated 后、return updated 前增加完全相同的账号事件：

~~~ts
const state: AccountAuthState = {
  userId: String(updated.id),
  status: updated.status,
  epoch: updated.authEpoch,
}

await tx.insert(authOutbox).values({
  eventType: 'account.changed',
  aggregateType: 'account',
  aggregateId: state.userId,
  aggregateVersion: state.epoch,
  payload: {
    schemaVersion: 1,
    state,
  } satisfies AccountChangedOutboxPayload,
})
~~~

正常 Refresh 只增加 refreshGeneration，不让 Access JWT 失效，所以不写 Auth State Outbox。

登录创建 active Session 也不写本节的撤销 Outbox。登录事务提交后 Redis 写失败时，客户端拿不到 Token，数据库可能留下孤儿 Session；由 expiresAt 清理任务处理。本节 Outbox 只保障撤销、禁用和版本提升类状态，不承诺恢复登录创建投影。

## 13.3 给 Repository 增加多实例 claim/lease 方法

修改：

~~~text
apps/server/src/modules/auth/auth.repository.ts
~~~

把 drizzle-orm import 扩展为下面这个完整列表。不要漏掉步骤 9 advisory lock 使用的 sql：

~~~ts
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm'
~~~

在 AuthRepository 类中增加：

~~~ts
findSessionById(sessionId: string) {
  return this.db.query.authSessions.findFirst({
    where: eq(authSessions.id, sessionId),
  })
}

async claimAuthOutbox(
  workerId: string,
  limit = 20,
  leaseMs = 60_000,
) {
  const now = new Date()
  const leaseExpiredBefore = new Date(now.getTime() - leaseMs)

  return this.db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: authOutbox.id })
      .from(authOutbox)
      .where(
        and(
          isNull(authOutbox.publishedAt),
          lte(authOutbox.nextAttemptAt, now),
          or(
            isNull(authOutbox.lockedAt),
            lt(authOutbox.lockedAt, leaseExpiredBefore),
          ),
        ),
      )
      .orderBy(
        asc(authOutbox.nextAttemptAt),
        asc(authOutbox.createdAt),
      )
      .limit(limit)
      .for('update', { skipLocked: true })

    if (candidates.length === 0) {
      return []
    }

    return tx
      .update(authOutbox)
      .set({
        lockedBy: workerId,
        lockedAt: now,
      })
      .where(
        inArray(
          authOutbox.id,
          candidates.map((row) => row.id),
        ),
      )
      .returning()
  })
}

async markOutboxPublished(id: string, workerId: string) {
  const [published] = await this.db
    .update(authOutbox)
    .set({
      publishedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      lastError: null,
    })
    .where(
      and(
        eq(authOutbox.id, id),
        eq(authOutbox.lockedBy, workerId),
        isNull(authOutbox.publishedAt),
      ),
    )
    .returning({ id: authOutbox.id })

  if (!published) {
    throw new Error(
      'Outbox ' + id + ' 的租约已丢失，禁止标记 published',
    )
  }
}

async releaseOutboxForRetry(input: {
  id: string
  workerId: string
  attempts: number
  error: unknown
}) {
  const attempts = input.attempts + 1
  const backoffMs = Math.min(
    5 * 60_000,
    1_000 * 2 ** Math.min(attempts - 1, 8),
  )

  const errorMessage =
    input.error instanceof Error
      ? input.error.name + ': ' + input.error.message
      : String(input.error)

  const [released] = await this.db
    .update(authOutbox)
    .set({
      attempts,
      nextAttemptAt: new Date(Date.now() + backoffMs),
      lastError: errorMessage.slice(0, 1000),
      lockedBy: null,
      lockedAt: null,
    })
    .where(
      and(
        eq(authOutbox.id, input.id),
        eq(authOutbox.lockedBy, input.workerId),
        isNull(authOutbox.publishedAt),
      ),
    )
    .returning({ id: authOutbox.id })

  if (!released) {
    throw new Error(
      'Outbox ' + input.id + ' 的租约已丢失，无法释放',
    )
  }
}
~~~

这里的并发协议是：

1. SELECT FOR UPDATE SKIP LOCKED 让多个 Worker 领取不同事件。
2. lockedBy 标识租约所有者。
3. lockedAt 超过 60 秒后允许其他 Worker 接管崩溃实例留下的事件。
4. 失败后按指数退避更新 nextAttemptAt。
5. 只有仍持有租约的 Worker 才能标记 published 或释放重试。
6. private running 只防止单进程定时器重入；真正的多实例协调来自数据库 claim/lease。

Outbox 仍按“至少一次”处理。投影和 publish 都必须幂等，不能假设事件只执行一次。

## 13.4 让 Publisher 支持 Worker 严格发布

修改：

~~~text
apps/server/src/modules/auth/state/auth-state.publisher.ts
~~~

把 accountChanged、sessionChanged 和 publish 三个方法替换成：

~~~ts
accountChanged(
  state: AccountAuthState,
  bestEffort = true,
) {
  return this.publish(
    {
      type: 'account.changed',
      userId: state.userId,
      version: state.epoch,
    },
    bestEffort,
  )
}

sessionChanged(
  state: SessionAuthState,
  bestEffort = true,
) {
  return this.publish(
    {
      type: 'session.changed',
      userId: state.userId,
      sessionId: state.sessionId,
      version: state.version,
    },
    bestEffort,
  )
}

private async publish(
  event: AuthStateInvalidationEvent,
  bestEffort: boolean,
) {
  const auth = this.config.getOrThrow<AuthConfig>('auth')

  try {
    await this.redis.publish(
      auth.eventChannel,
      JSON.stringify(event),
    )
  } catch (error) {
    this.logger.warn(
      'Auth State 失效事件发布失败：' + String(error),
    )

    if (!bestEffort) {
      throw error
    }
  }
}
~~~

AuthService 仍使用默认 bestEffort。Outbox Worker 会传 false，只有 publish 成功后才标记 published。

## 13.5 新增可多实例运行的 Outbox Worker

新增：

~~~text
apps/server/src/modules/auth/state/auth-outbox.worker.ts
~~~

粘贴完整代码：

~~~ts
import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { AuthRepository } from '../auth.repository'
import type {
  AccountAuthState,
  SessionAuthState,
} from '../auth.types'
import { AuthStatePublisher } from './auth-state.publisher'
import { AuthStateService } from './auth-state.service'

type ClaimedOutboxRow =
  Awaited<
    ReturnType<AuthRepository['claimAuthOutbox']>
  >[number]

function invalid(
  row: ClaimedOutboxRow,
  message: string,
): never {
  throw new Error(
    'Auth Outbox ' + row.id + ' 非法：' + message,
  )
}

function readRecord(
  row: ClaimedOutboxRow,
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    invalid(row, field + ' 必须是对象')
  }

  return value as Record<string, unknown>
}

function readString(
  row: ClaimedOutboxRow,
  value: Record<string, unknown>,
  field: string,
) {
  const result = value[field]

  if (
    typeof result !== 'string' ||
    result.length === 0 ||
    result.trim() !== result
  ) {
    invalid(
      row,
      field + ' 必须是非空且无首尾空格的字符串',
    )
  }

  return result
}

function readPositiveInteger(
  row: ClaimedOutboxRow,
  value: Record<string, unknown>,
  field: string,
) {
  const result = value[field]

  if (
    typeof result !== 'number' ||
    !Number.isSafeInteger(result) ||
    result < 1
  ) {
    invalid(row, field + ' 必须是正安全整数')
  }

  return result
}

function assertUserId(
  row: ClaimedOutboxRow,
  userId: string,
) {
  const numericId = Number(userId)

  if (
    !/^[1-9][0-9]*$/.test(userId) ||
    !Number.isSafeInteger(numericId)
  ) {
    invalid(row, 'userId 格式非法')
  }

  return numericId
}

function parseAccountPayload(
  row: ClaimedOutboxRow,
): AccountAuthState {
  if (
    row.aggregateType !== 'account' ||
    row.eventType !== 'account.changed'
  ) {
    invalid(row, '账号事件类型与聚合类型不匹配')
  }

  const payload = readRecord(row, row.payload, 'payload')

  if (payload.schemaVersion !== 1) {
    invalid(row, '不支持的账号 payload schemaVersion')
  }

  const source = readRecord(
    row,
    payload.state,
    'payload.state',
  )
  const userId = readString(row, source, 'userId')
  const status = readString(row, source, 'status')
  const epoch = readPositiveInteger(row, source, 'epoch')

  assertUserId(row, userId)

  if (
    status !== 'active' &&
    status !== 'locked' &&
    status !== 'disabled'
  ) {
    invalid(row, '账号 status 非法')
  }

  if (userId !== row.aggregateId) {
    invalid(row, '账号 ID 与 aggregateId 不一致')
  }

  if (epoch !== row.aggregateVersion) {
    invalid(row, '账号 epoch 与 aggregateVersion 不一致')
  }

  return { userId, status, epoch }
}

function parseSessionPayload(
  row: ClaimedOutboxRow,
): SessionAuthState {
  if (
    row.aggregateType !== 'session' ||
    row.eventType !== 'session.changed'
  ) {
    invalid(row, 'Session 事件类型与聚合类型不匹配')
  }

  const payload = readRecord(row, row.payload, 'payload')

  if (payload.schemaVersion !== 1) {
    invalid(row, '不支持的 Session payload schemaVersion')
  }

  const source = readRecord(
    row,
    payload.state,
    'payload.state',
  )
  const sessionId = readString(row, source, 'sessionId')
  const userId = readString(row, source, 'userId')
  const status = readString(row, source, 'status')
  const version = readPositiveInteger(
    row,
    source,
    'version',
  )
  const expiresAtMs = readPositiveInteger(
    row,
    source,
    'expiresAtMs',
  )

  assertUserId(row, userId)

  if (status !== 'active' && status !== 'revoked') {
    invalid(row, 'Session status 非法')
  }

  if (sessionId !== row.aggregateId) {
    invalid(row, 'sessionId 与 aggregateId 不一致')
  }

  if (version !== row.aggregateVersion) {
    invalid(row, 'Session version 与 aggregateVersion 不一致')
  }

  if (!Number.isFinite(new Date(expiresAtMs).getTime())) {
    invalid(row, 'expiresAtMs 超出 Date 支持范围')
  }

  return {
    sessionId,
    userId,
    status,
    version,
    expiresAtMs,
  }
}

@Injectable()
export class AuthOutboxWorker {
  private readonly logger = new Logger(AuthOutboxWorker.name)
  private readonly workerId = randomUUID()
  private running = false

  constructor(
    private readonly repository: AuthRepository,
    private readonly authState: AuthStateService,
    private readonly publisher: AuthStatePublisher,
  ) {}

  @Interval(1_000)
  async flush() {
    if (this.running) {
      return
    }

    this.running = true

    try {
      const rows = await this.repository.claimAuthOutbox(
        this.workerId,
        20,
        60_000,
      )

      for (const row of rows) {
        try {
          await this.process(row)

          await this.repository.markOutboxPublished(
            row.id,
            this.workerId,
          )
        } catch (error) {
          try {
            await this.repository.releaseOutboxForRetry({
              id: row.id,
              workerId: this.workerId,
              attempts: row.attempts,
              error,
            })
          } catch (releaseError) {
            this.logger.error(
              'Auth Outbox ' +
                row.id +
                ' 释放失败：' +
                String(releaseError),
            )
          }

          if (row.attempts + 1 >= 10) {
            this.logger.error(
              'Auth Outbox ' +
                row.id +
                ' 已连续失败 ' +
                String(row.attempts + 1) +
                ' 次，需要告警或死信处理：' +
                String(error),
            )
          } else {
            this.logger.warn(
              'Auth Outbox ' +
                row.id +
                ' 处理失败：' +
                String(error),
            )
          }
        }
      }
    } finally {
      this.running = false
    }
  }

  private process(row: ClaimedOutboxRow) {
    switch (row.aggregateType) {
      case 'account':
        return this.processAccount(row)
      case 'session':
        return this.processSession(row)
      default:
        invalid(
          row,
          '未知 aggregateType：' + row.aggregateType,
        )
    }
  }

  private async processAccount(row: ClaimedOutboxRow) {
    const eventState = parseAccountPayload(row)
    const account = await this.repository.findUserById(
      assertUserId(row, eventState.userId),
    )

    let state: AccountAuthState

    if (account) {
      state = {
        userId: String(account.id),
        status: account.status,
        epoch: account.authEpoch,
      }

      if (state.epoch < eventState.epoch) {
        invalid(row, '数据库账号版本低于 Outbox 版本')
      }

      if (
        state.epoch === eventState.epoch &&
        (state.userId !== eventState.userId ||
          state.status !== eventState.status)
      ) {
        invalid(row, '账号同版本状态不一致')
      }
    } else {
      if (eventState.status !== 'disabled') {
        invalid(
          row,
          '账号行缺失时只允许 disabled tombstone',
        )
      }

      state = eventState
    }

    await this.authState.writeThroughAccount(state)
    await this.publisher.accountChanged(state, false)
  }

  private async processSession(row: ClaimedOutboxRow) {
    const eventState = parseSessionPayload(row)
    const session = await this.repository.findSessionById(
      eventState.sessionId,
    )

    let state: SessionAuthState

    if (session) {
      state = {
        sessionId: session.id,
        userId: String(session.userId),
        status: session.status,
        version: session.version,
        expiresAtMs: session.expiresAt.getTime(),
      }

      if (state.version < eventState.version) {
        invalid(row, '数据库 Session 版本低于 Outbox 版本')
      }

      if (
        state.version === eventState.version &&
        (state.sessionId !== eventState.sessionId ||
          state.userId !== eventState.userId ||
          state.status !== eventState.status ||
          state.expiresAtMs !== eventState.expiresAtMs)
      ) {
        invalid(row, 'Session 同版本状态不一致')
      }

      if (
        eventState.status === 'revoked' &&
        state.status === 'active'
      ) {
        invalid(row, '已撤销 Session 不允许恢复为 active')
      }
    } else {
      if (eventState.status !== 'revoked') {
        invalid(
          row,
          'Session 行缺失时只允许 revoked tombstone',
        )
      }

      state = eventState
    }

    await this.authState.writeThroughSession(state)
    await this.publisher.sessionChanged(state, false)
  }
}
~~~

处理顺序必须是：

~~~text
领取租约
-> 校验 eventType、aggregateType、aggregateVersion 和完整 payload
-> 有数据库行时读取当前更高版本
-> 无数据库行时只允许 disabled / revoked tombstone
-> 单调投影 Redis
-> 严格 publish
-> 最后标记 published
~~~

以下情况必须抛错、释放租约并保持 publishedAt 为 null：

- 未知 aggregateType。
- eventType 与 aggregateType 不匹配。
- payload 结构或 schemaVersion 非法。
- aggregateId、aggregateVersion 与 payload 不一致。
- 数据库版本低于 Outbox 版本。
- 相同版本却有不同字段。
- 数据库行缺失但 payload 仍是 active 或 locked。
- 试图让 revoked sid 恢复 active。

超过 10 次只触发告警或进入人工可恢复的死信流程，绝不能为了清空积压而自动标记 published。

## 13.6 固定认证数据保留与物理删除规则

这一步先规定清理边界，不要把 consumed 或 revoked Refresh Token 当成“已经没用，可以立即删除”。它们的 hash 是 Refresh 重放检测证据，数据库、日志和 Outbox 中仍然禁止保存 Refresh Token 明文。

至少保留到对应 Refresh Family 的绝对 `expiresAt` 之后，再加上允许的时钟偏差和运维缓冲。可以把最早删除时间理解为：

~~~text
deleteAfter = family.expiresAt
            + clockToleranceSeconds
            + 运维缓冲时间
~~~

运维缓冲建议至少 24 小时；有审计要求时可以更久。`active`、`consumed`、`revoked` 三种 Token 在保留期内都不能因为“节省表空间”而提前物理删除。

删除账号或认证数据时，严格按下面顺序操作：

1. 先把 User 改成 `disabled`，增加 `authEpoch`，并在同一事务写完整 `account.changed` tombstone Outbox。
2. 把该用户所有 Session 改成 `revoked`，各自增加 `version`，并在同一事务写完整 `session.changed` tombstone Outbox。
3. 等待这些 Outbox 全部成功投影 Redis、成功 publish，并写入 `publishedAt`。
4. 等待最长 Access Token 和 Refresh Token 有效期结束。
5. 再等待时钟偏差、Redis tombstone TTL 和故障恢复保留窗口结束。
6. 删除 `refresh_tokens`，包括 consumed / revoked token hash。
7. 删除 `refresh_token_families`。
8. 删除 `auth_sessions`。
9. 最后才允许删除 `users`。

步骤 4 和步骤 5 不是二选一，两段时间都要等。步骤 4 防止尚未过期的凭证找不到权威记录，步骤 5 给乱序事件、缓存 tombstone 和故障恢复留下安全窗口。

真正执行物理删除前，先运行：

~~~sql
SELECT COUNT(*) AS unpublished_count
FROM auth_outbox
WHERE published_at IS NULL;
~~~

只要待删除聚合仍有未发布事件，就必须停止清理。普通清理任务永远不能删除 `published_at IS NULL` 的 Outbox；已发布 Outbox 建议继续保留 7～30 天用于审计和排障。

步骤 4.1 中的外键已经使用 `restrict`。不要为了让删除“方便”而改成级联删除；`restrict` 会迫使清理任务显式遵守 Token → Family → Session → User 的删除顺序。

超过最大重试次数的 poison event 只能告警或进入可人工恢复的死信流程，不能自动标记 published，也不能被清理任务删除。

## 13.7 注册 ScheduleModule 和 Worker

修改：

~~~text
apps/server/src/modules/auth/auth.module.ts
~~~

增加 import：

~~~ts
import { ScheduleModule } from '@nestjs/schedule'
import { AuthOutboxWorker } from './state/auth-outbox.worker'
~~~

在 imports 数组中增加：

~~~ts
ScheduleModule.forRoot(),
~~~

在 providers 中增加：

~~~ts
AuthOutboxWorker,
~~~

## 13.8 构建和验收

~~~powershell
vp run "server#build"
~~~

验收场景：

1. 正常 logout 后，auth_outbox 出现 session.changed。
2. Worker 成功投影和 publish 后，published_at 被填写。
3. 两个 Worker 实例同时领取同一批事件时，`FOR UPDATE SKIP LOCKED` 使它们拿到的 id 集合没有交集。
4. Worker 领取后模拟进程退出；租约到期以前其他 Worker 不能领取，超过 60 秒以后可以接管。
5. 未知类型、非法 payload、同版本不同状态都必须增加 attempts、释放租约并保持 published_at 为 null。
6. PostgreSQL 聚合行已缺失时，只有 disabled Account 或 revoked Session tombstone 可以继续处理。
7. 重复运行 Worker 或按 12、10、11 的顺序投递事件，不会让 Redis 版本回退。
8. publish 成功但标记 published 前进程崩溃时，重启后会重复发布；Subscriber 将其当成 no-op。

不要用“先停 Redis，再调用 logout”来模拟“数据库已经提交、随后 Redis 写失败”。如果 Redis 在请求进入 Guard 前就不可用，StrongAuth 会先返回 503，AuthService 根本不会开始撤销事务，此时 PostgreSQL 和 Outbox 都应该没有变化。

要验证真正的提交后传播失败，写一个集成测试做故障注入：

1. 使用真实测试 PostgreSQL 调用 `AuthService.logoutCurrent`，不要经过 HTTP Guard。
2. 保留真实 Repository，让撤销 Session 和写 Outbox 的事务正常提交。
3. 对 `AuthStateService.writeThroughSession` 使用 `vi.spyOn(...).mockRejectedValueOnce(...)`，只让事务提交后的 Redis write-through 抛出 503。
4. 断言调用返回 503，但 PostgreSQL Session 已是 revoked、version 已增加，而且对应 Outbox 的 published_at 仍是 null。
5. 恢复 `writeThroughSession`，启动 Redis，再手动调用一次 `AuthOutboxWorker.flush()`。
6. 断言 Redis 出现 revoked tombstone、publish 成功，并且 Outbox 最终写入 published_at。

另写一个 HTTP 集成场景验证“Redis 请求前已不可用”：停止 Redis 后调用带 `@StrongAuth()` 的撤销接口，必须得到 503，并断言 Session、version 和 Outbox 数量完全不变。

## 强一致边界

Outbox 仍不能让 PostgreSQL 和 Redis 成为一个 ACID 事务。

本教程定义的 strong 保证是：

- 安全命令成功响应以后，共享 Redis Auth State 已更新。
- 此后开始的 StrongAuth 请求会看到新状态。
- 如果共享状态未知、缺失或版本异常，则回源修复或失败关闭。

一个与撤销命令并发、并且在撤销完成前已经开始的请求仍可能完成。这是正常的并发边界。

如果你的业务要求所有高风险读写都与 PostgreSQL 撤销事务线性化，应让该类接口直接读取同一个 PostgreSQL 权威行并加锁，或把在线认证状态的权威写入迁移到支持原子修改和发布的单一系统。不要把“最终 Outbox 同步”描述成绝对线性一致。

## 完成检查点

- 撤销状态和 Outbox 在同一个 PostgreSQL 事务。
- Worker 先投影 Redis，再 publish，最后标记 published。
- publish 失败时 Outbox 保持未发布。
- Worker 崩溃重启后可以继续。
- 重复和乱序事件不会让 Redis 版本回退。

# 步骤 14：接入服务端测试命令并建立验收清单

## 14.1 给 server 增加 test script

修改：

~~~text
apps/server/package.json
~~~

在 scripts 中增加：

~~~json
{
  "test": "vp test"
}
~~~

Vite+ 的测试 import 使用：

~~~ts
import {
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test'
~~~

不要再单独安装 Vitest，也不要从 vitest import。

## 14.2 后续必须落地的自动测试清单

下面是验收矩阵，不代表测试已经实现。只有创建对应的 *.spec.ts 文件并实际通过后，才能声明自动测试完成。如果仓库里还没有任何测试文件，不能因为 vp run "server#test" 没报错就认为鉴权已经验证完成。

先落地一个不依赖 PostgreSQL 和 Redis 的最小测试，证明 Vite+ 测试入口、JWT 配置和 Refresh HMAC 原语能真正运行。

新增：

~~~text
apps/server/src/modules/auth/token.service.spec.ts
~~~

粘贴：

~~~ts
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { describe, expect, it } from 'vite-plus/test'
import type { AuthConfig } from '@/config/auth.config'
import {
  AccessTokenService,
  RefreshTokenCodec,
} from './token.service'

const auth: AuthConfig = {
  accessSecret:
    'test-only-access-secret-please-never-use-this-value-in-production',
  issuer: 'bubbles-auth-test',
  audience: 'bubbles-api-test',
  accessTtlSeconds: 600,
  refreshTtlSeconds: 30 * 24 * 60 * 60,
  refreshPepper:
    'test-only-refresh-pepper-please-never-use-this-value-in-production',
  clockToleranceSeconds: 30,
  localCacheTtlMs: 30_000,
  tombstoneTtlSeconds: 900,
  cookieName: 'refresh_token',
  cookiePath: '/auth',
  cookieSecure: false,
  eventChannel: 'auth-state:invalidate:test',
}

function createConfigService() {
  return {
    getOrThrow<T>(key: string): T {
      if (key !== 'auth') {
        throw new Error('未知配置：' + key)
      }

      return auth as T
    },
  } as unknown as ConfigService
}

function createJwtService() {
  return new JwtService({
    secret: auth.accessSecret,
    signOptions: {
      algorithm: 'HS256',
      expiresIn: auth.accessTtlSeconds,
      issuer: auth.issuer,
      audience: auth.audience,
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer: auth.issuer,
      audience: auth.audience,
      clockTolerance: auth.clockToleranceSeconds,
    },
  })
}

describe('AccessTokenService', () => {
  it('签发的 JWT 可以恢复身份和两个版本号', async () => {
    const service = new AccessTokenService(
      createJwtService(),
      createConfigService(),
    )

    const issued = await service.sign({
      userId: 42,
      sessionId: 'd8878d24-42a0-4e1a-a806-8dfdc7634d26',
      accountEpoch: 3,
      sessionVersion: 7,
    })

    const claims = await service.verify(issued.accessToken)

    expect(issued.accessExpiresIn).toBe(600)
    expect(claims).toMatchObject({
      sub: '42',
      sid: 'd8878d24-42a0-4e1a-a806-8dfdc7634d26',
      ae: 3,
      sv: 7,
      iss: auth.issuer,
      aud: auth.audience,
    })
    expect(claims.jti).toEqual(expect.any(String))
    expect(claims.exp - claims.iat).toBe(600)
  })

  it('拒绝签名被篡改的 JWT', async () => {
    const service = new AccessTokenService(
      createJwtService(),
      createConfigService(),
    )

    const issued = await service.sign({
      userId: 42,
      sessionId: 'd8878d24-42a0-4e1a-a806-8dfdc7634d26',
      accountEpoch: 1,
      sessionVersion: 1,
    })

    const parts = issued.accessToken.split('.')
    const signature = parts[2]

    parts[2] =
      (signature.startsWith('a') ? 'b' : 'a') +
      signature.slice(1)

    await expect(
      service.verify(parts.join('.')),
    ).rejects.toThrow('访问令牌无效或已过期')
  })

  it('Refresh Token 只保存可重复计算的 HMAC 摘要', () => {
    const codec = new RefreshTokenCodec(createConfigService())
    const token = codec.create()

    expect(token.raw).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(token.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(token.hash).not.toBe(token.raw)
    expect(codec.hash(token.raw)).toBe(token.hash)
  })
})
~~~

立即执行：

~~~powershell
vp run "server#test"
~~~

必须看到 3 个测试通过。这个最小测试通过只代表测试入口和 Token 原语正确，不能代替下面依赖 PostgreSQL、Redis 和 HTTP 的集成验收。

### 登录

- 正确密码成功。
- 不存在的邮箱和错误密码返回相同 401。
- 密码数据库只保存 Argon2id hash。
- Refresh Cookie 的 HttpOnly、Secure、SameSite、Path 正确。
- JSON 响应不包含 Refresh Token。

### Access JWT

- 正确签名、issuer、audience 和 exp 才通过。
- 修改 sub、sid、ae 或 sv 后验签失败。
- Token 生命周期超过配置最大值时拒绝。
- Public 与 Bypass 互不影响。

### Refresh 轮换

- 正常轮换后旧 Token 是 consumed，新 Token 是 active。
- generation 增加，但 accountAuthEpoch 和 sessionVersion 不增加。
- 同一个 Refresh Token 20 个并发请求只有一个轮换成功。
- 严格模式下其余并发请求触发 Family compromised 和 Session revoked。
- 两个 Refresh 使用同一 sid 时确实在 advisory lock 上串行，而不是依赖偶然的执行顺序。
- 重放撤销确实提交，不会因事务内 throw 回滚。
- 已撤销 Family 不能继续刷新。
- accountAuthEpoch 改变后，旧 Family 即使仍标 active 也不能刷新。

### 踢人和改密

- 当前设备退出不影响另一个 sid。
- 重复退出不重复增加 sessionVersion。
- 管理员单设备踢人只影响指定 sid。
- logout 先拿锁时，并发 Refresh 重读到 revoked 并返回 invalid。
- Refresh 先拿锁时，随后 logout 会撤销刚创建的 active Refresh Token。
- 管理员踢人与 Refresh 的两个先后顺序得到相同最终状态。
- logout-all 只增加一次 accountAuthEpoch。
- 改密在同一事务更新 passwordHash 和 accountAuthEpoch。
- 所有旧 Access 和 Refresh Token 在改密后失效。

### bounded 与 strong

- bounded 在 TTL 内可以短暂接受尚未收到事件的旧状态。
- Pub/Sub 到达后，缓存被标 dirty 或 versionFloor 提高。
- 完全丢失 Pub/Sub 时，fake timer 推进到 TTL 后发生 Pull 并拒绝旧 Token。
- 一百个并发请求遇到同一个过期 sid 时只有一次 Redis Pull。
- single-flight 的 key 包含 sub、sid、ae、sv；不同版本 JWT 不能错误共用同一个 Pull Promise。
- L1 已存在时暂停旧 Pull，再送达更高版本 Push；旧 Pull 完成后不能把条目标回 clean，也不能延长旧状态 TTL。
- L1 不存在时暂停 Pull，再送达更高版本 Push；fence 仍会提高，旧 Pull 不能创建过时的干净缓存。
- Redis Pull 返回与 fence 同版本但字段不同的状态时失败关闭，不能任选一个覆盖。
- StrongAuth 始终绕过 L1。
- StrongAuth 的 Pull 期间收到更高版本 Push 时，必须按 fence 拒绝旧结果。
- Redis 故障时 StrongAuth 返回 503。
- bounded 只有干净且未过期缓存可以短暂继续服务。
- Redis key 缺失不会默认 active。

### Outbox

- 数据库状态和 Outbox 同事务提交。
- 两个 Worker 并发 claim 时，领取到的 Outbox id 集合没有交集。
- Worker 崩溃后，其他实例在租约有效期内不能抢占，租约超时后可以接管。
- Redis 投影失败或严格 publish 失败时，Outbox 保持未发布、释放租约并按退避时间重试。
- 恢复 Redis 后 Worker 自动投影并发布。
- 未知 aggregateType、eventType 不匹配、非法 payload、同版本不同状态都保持未发布。
- 数据库 Account 行缺失时只允许 disabled tombstone；Session 行缺失时只允许 revoked tombstone。
- 事件顺序 12、10、11 最终状态仍是 12。
- 重复 publish 不会造成额外版本增加。
- Redis 在 HTTP 请求进入 StrongAuth Guard 前不可用时，接口返回 503，数据库 Session 和 Outbox 都不变化。
- Repository 事务已提交、随后 write-through 被故障注入为失败时，数据库已经 revoked 且 Outbox 未发布；Worker 恢复后完成修复。

## 14.3 测试代码落地后执行的收口命令

先保证 PostgreSQL 和 Redis 测试实例可用，然后执行：

~~~powershell
vp check
vp run "server#test"
vp run "server#build"
vp run ready
~~~

vp check 会执行格式、Lint 和类型检查。不要只看 nest build。

当前根脚本 ready 会运行各工作区 test 和 build；只有 server 增加 test script 后，它才真正覆盖服务端测试。

## 14.4 当前必须执行的人工验收顺序

严格按顺序走一次：

1. 注册账号。
2. 登录，检查 Access JSON 和 HttpOnly Cookie。
3. 带 Access 调用普通 me。
4. 正常 refresh，确认 Cookie 被置换。
5. 重放旧 Refresh，确认整个 Session 撤销。
6. 两个设备登录，退出一个设备，另一个仍有效。
7. logout-all，确认全部旧设备失效。
8. 改密，确认旧密码和所有旧 Token 失效。
9. 两实例测试 Pub/Sub 立即标脏。
10. 断开 Subscriber，确认最多一个 TTL 后收敛。
11. 在请求前停 Redis，调用 StrongAuth 接口，确认返回 503，并确认 Session、version 和 Outbox 数量都不变化。
12. 用集成测试 mock `writeThroughSession` 在数据库事务提交后抛错，确认数据库已 revoked、Outbox 未发布。
13. 恢复 Redis 并运行 Worker，确认 revoked tombstone、publish 和 published_at 全部完成。
14. 同时运行两个 Worker，确认不会重复领取；模拟一个 Worker 崩溃，确认租约超时后另一个 Worker 能接管。
15. 注入未知事件、非法 payload 和同版本冲突，确认它们持续未发布并产生告警，而不是被静默跳过。

每一步都检查 PostgreSQL、Redis 和 HTTP 结果三者一致。

# 步骤 15：旧账号密码回填后把 passwordHash 改成 NOT NULL

只有所有正式账号都已经有密码哈希后才执行。

先查询：

~~~sql
SELECT COUNT(*)
FROM users
WHERE password_hash IS NULL;
~~~

结果必须为 0。

然后把 schema 中：

~~~ts
passwordHash: varchar('password_hash', { length: 255 }),
~~~

改成：

~~~ts
passwordHash: varchar('password_hash', { length: 255 }).notNull(),
~~~

生成并审查第二次迁移：

~~~powershell
vp run "server#db:generate"
vp run "server#db:migrate"
vp run "server#build"
~~~

不要给旧账号填一个所有人共用的假密码。旧账号应通过安全的密码重置、管理员邀请或导入流程生成各自的真实 hash。

# 附录 A：多微服务非对称签名迁移路线（本教程不实施）

当前教程为了先在一个 Nest 服务中跑通，使用 HS256。

本教程的可执行交付边界是步骤 0～15 的单体 HS256 实现。本附录只说明拆分微服务后的迁移方向，不包含私钥管理、JWKS Controller、公钥缓存、kid 轮换代码及验收，因此不计入任何交付停点。等仓库中真的出现独立认证服务和业务微服务后，应按实际服务名另写一份逐文件迁移教程，不能直接把下面的路线当成已经完成的代码。

真正拆成多个微服务以后：

~~~text
认证服务
  持有私钥
  负责签发 JWT

业务微服务
  只持有公钥或读取 JWKS
  只能验签，不能伪造 JWT
~~~

推荐步骤：

1. 选择 EdDSA 或 RS256。
2. 每把签名密钥分配 kid。
3. JWT header 带 kid。
4. 认证服务只保存私钥。
5. 暴露只含公钥的 JWKS。
6. 业务服务按 kid 缓存公钥。
7. 密钥轮换时先发布新公钥，再开始用新私钥签发。
8. 至少保留旧公钥到所有旧 Access JWT 过期。
9. Guard 固定允许算法，不能信任 Token 自报的任意 alg。

微服务仍然保留本教程的 Auth State 逻辑：

- 本地验证 JWT 签名。
- 普通接口读取本地 30 秒 L1。
- StrongAuth 读取共享 Redis 主节点。
- Pub/Sub 标脏。
- TTL Pull 兜底。
- Outbox 修复崩溃窗口。

业务微服务不需要每个请求调用用户中心。只有：

- L1 miss。
- L1 过期。
- 缓存被 Push 标脏。
- JWT claim 比缓存新。
- StrongAuth。

这些情况才 Pull 共享 Auth State。

# 附录 B：生产前不能省略的安全项

- 登录和 refresh 做 IP、账号和设备维度限流。
- 登录错误文案统一，日志不能记录密码和 Token。
- Refresh Cookie 使用 HTTPS、HttpOnly、合理 SameSite。
- 跨站 Cookie 场景增加 CSRF 防护。
- 密码修改、MFA 关闭、密钥导出增加 Recent Auth。
- 权限变更可再增加 permissionEpoch，不要滥用 accountAuthEpoch。
- 租户 ID 不能只信任请求头，必须与身份和权限绑定。
- Session、Family、Token、Outbox 增加定期清理。
- 监控 refresh reuse、strict 503、Redis Pull 延迟、L1 命中率、Subscriber 重连和 Outbox lag。
- 日志对 sid、userId 做必要审计，但不记录 Refresh 原文和完整 Authorization。
- 生产环境移除 TestDbModule 和 TestRedisModule。

# 最终理解

这套设计不是“JWT 完全无状态”，而是把工作分层：

~~~text
JWT
  证明这个身份曾被认证服务合法签发

accountAuthEpoch 和 sessionVersion
  证明这个身份现在是否仍然有效

L1 30 秒缓存
  让普通请求不必每次访问共享状态

StrongAuth
  让高风险接口主动支付一次实时 Redis 查询

Pub/Sub Push
  只通知缓存变脏

按需 Pull
  真正读取共享 Redis 或 PostgreSQL 权威状态

Outbox
  修复数据库提交后进程崩溃导致的传播缺口
~~~

你最开始担心的“多个用户同时改密会让所有微服务疯狂查询用户中心”，在这里被拆成：

~~~text
每个改密用户只产生一个 account epoch 事件
-> 微服务没有该用户缓存就忽略
-> 有缓存只标脏
-> 该用户真正再次访问时才 Pull
-> 同一用户并发 Pull 由 single-flight 合并
~~~

因此它保留了 JWT 的本地验签优势，又提供了可控的踢人实时性。

# 三个可交付停点

如果你分阶段开发，可以按下面三个停点提交：

## 停点 A：完成步骤 0 至 10

- 功能正确。
- 所有保护接口强查 Redis。
- 可以先内部联调。

## 停点 B：完成步骤 11 至 12

- 达到你的目标架构。
- 普通接口最多约 30 秒延迟。
- StrongAuth 实时查询。
- Push/Pull 已工作。

## 停点 C：完成步骤 13 至 15（不含非对称迁移）

- Outbox 多实例 claim/lease、租约超时接管、严格发布和崩溃恢复都已按步骤实现并实际验收。
- “Redis 请求前不可用”和“数据库提交后 write-through 失败”两个故障场景已分别测试，不能用一个场景代替另一个。
- consumed / revoked Refresh hash 的保留期已确定，未发布 Outbox 不会被清理，物理删除严格按 Token → Family → Session → User 执行。
- server 测试命令已经接入；自动测试验收矩阵只是一张待办表，只有对应 `*.spec.ts` 实际创建并通过后，才能声明该项自动化测试完成。
- 旧账号回填确实完成以后，passwordHash 才收紧为 NOT NULL。
- 到此达到本教程的单体交付边界；附录 A 的非对称签名和 JWKS 迁移不属于停点 C。

不要在停点 A 尚未通过时直接实现停点 B。先保证撤销逻辑正确，再优化 Redis 查询量。
