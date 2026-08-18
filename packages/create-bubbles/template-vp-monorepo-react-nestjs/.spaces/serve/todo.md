# Server 未完成事项与改造路线图

> 审计日期：2026-08-18  
> 审计对象：当前仓库的 apps/server 实际源码，而不是文档中计划实现的代码。  
> 对照项目：buqiyuan/nest-admin、linlingqin77/Nest-Admin-Soybean，以及当前项目已有的异常处理与 Session 设计文档。

## 0. 先给结论

当前 Server 不是完整的管理后台后端，而是一个具备以下能力的开发模板：

- NestJS 11 + Fastify。
- PostgreSQL + Drizzle ORM。
- Redis。
- Zod 请求 DTO、Swagger。
- 用户注册、登录、退出、获取当前用户。
- Argon2id 密码哈希。
- Opaque Bearer Token + Redis Session 的基础设计。
- 全局 Session 认证 Guard。

但目前距离可安全部署仍有明显差距，而且有几项不是“以后再增强”，而是会直接导致认证不可用、敏感数据暴露或生产无法启动的阻断问题。

最先处理的顺序必须是：

1. 移除运行时 DB/Redis 测试接口。
2. 修复 Redis Session 的四个 Lua 错误并补真实 Redis 测试。
3. 轮换已提交的密钥，建立正确的环境变量管理方式。
4. 修复生产依赖、迁移文件和生产启动命令。
5. 按现有异常处理指南落地统一错误协议。
6. 加入登录限流、抗账号枚举和最小授权模型。
7. 再建设用户、角色、菜单、审计、文件、任务等管理后台模块。

异常处理的完整施工步骤不在本文件重复，请直接执行：

[NestJS 11 全链路统一错误处理改造指南](../server/登录/04.exception.md)

## 1. 优先级定义

| 优先级 | 含义                                                   |
| ------ | ------------------------------------------------------ |
| P0     | 当前存在运行时错误、安全暴露或发布阻断；完成前不要上线 |
| P1     | 第一套测试环境或生产环境前必须具备的后端基线           |
| P2     | 成为完整管理后台所需要的业务与平台能力                 |
| P3     | 规模扩大、合规或明确产品需求出现后再实施               |

## 2. 当前能力对照

| 能力                   | 当前状态                 | 判断                                      |
| ---------------------- | ------------------------ | ----------------------------------------- |
| NestJS + Fastify 启动  | 已有                     | 可保留                                    |
| PostgreSQL + Drizzle   | 部分完成                 | 缺迁移版本控制、连接池生命周期和生产参数  |
| Redis Session          | 设计已有但当前被错误阻断 | Lua 脚本必须先修                          |
| Argon2id 密码          | 已有                     | 缺参数版本、rehash、抗枚举与限流          |
| Zod 请求校验           | 已有                     | 缺统一 validation 错误协议                |
| Zod 响应防泄漏         | 名义存在                 | 没有任何运行时响应 schema，实际未形成保护 |
| Swagger                | 部分完成                 | 永久公开，缺响应与错误契约                |
| 统一异常处理           | 未实现                   | 仅成功响应被包装                          |
| requestId 与结构化日志 | 未实现                   | 无请求关联、统一脱敏和访问日志            |
| 自动化 Server 测试     | 未实现                   | 现有 modules/test 是运行时接口，不是测试  |
| RBAC 与资源授权        | 未实现                   | 所有登录用户权限相同                      |
| 用户管理后台           | 未实现                   | 只有注册、登录、me、logout                |
| 菜单、角色、部门、公司 | 未实现                   | 数据表与 API 均不存在                     |
| 审计、登录日志         | 未实现                   | 无安全事件记录                            |
| 健康检查与优雅停机     | 未实现                   | 无 live/ready，也没有关闭数据库连接池     |
| 文件上传与 MinIO       | 未实现                   | Compose 有 MinIO，但 Server 没有任何接入  |
| 队列与定时任务         | 未实现                   | 无 Bull、Schedule、Worker 或失败治理      |
| 生产镜像与 CI/CD       | 未实现                   | 无 Server Dockerfile 和流水线             |

### 2.1 从两个参考项目分别借鉴什么

| 参考项目            | 值得借鉴                                                                                | 当前项目应该怎样吸收                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| buqiyuan/nest-admin | 管理后台模块拆分、用户/角色/权限/菜单、任务、日志、文件等成熟功能边界                   | 借鉴模块和权限模型，不复制 HTTP 200 业务错误、字符串 split、Filter 内进程监听器                                                                          |
| Nest-Admin-Soybean  | 错误码目录与文档、requestId、结构化日志和脱敏、登录安全、租户与可观测性模块、较完整测试 | 先吸收错误契约、日志、安全测试和模块边界；租户、MFA、OTel 等按产品需要实施，不复制错误返回 200、开发环境返回 stack、信任客户端 requestId 或过晚启动 OTel |

本文件不是要求把两个仓库的全部模块复制过来，而是把当前项目真正缺失的能力分成“阻断项、生产基线、管理后台能力、可选扩展”四层。

### 2.2 参考证据与建议边界

本次核对固定在以下提交：

- nest-admin：2eeccc4cb699d1aedbe04b4437a9d095cde02c74。
- Nest-Admin-Soybean：83a83f72189565e4eff3f2ca074f558d82e907e5。
- Soybean 异常体系重构提交：866475d374c31b4b317f41089da40abd2e13dbfd。

可直接审计的核心文件：

- [nest-admin 全局 Filter](https://github.com/buqiyuan/nest-admin/blob/2eeccc4cb699d1aedbe04b4437a9d095cde02c74/src/common/filters/any-exception.filter.ts)
- [nest-admin BusinessException](https://github.com/buqiyuan/nest-admin/blob/2eeccc4cb699d1aedbe04b4437a9d095cde02c74/src/common/exceptions/biz.exception.ts)
- [nest-admin 错误码](https://github.com/buqiyuan/nest-admin/blob/2eeccc4cb699d1aedbe04b4437a9d095cde02c74/src/constants/error-code.constant.ts)
- [Soybean 全局 Filter](https://github.com/linlingqin77/Nest-Admin-Soybean/blob/83a83f72189565e4eff3f2ca074f558d82e907e5/apps/server/src/core/filters/global-exception.filter.ts)
- [Soybean requestId middleware](https://github.com/linlingqin77/Nest-Admin-Soybean/blob/83a83f72189565e4eff3f2ca074f558d82e907e5/apps/server/src/core/middleware/request-id.middleware.ts)
- [Soybean BusinessException](https://github.com/linlingqin77/Nest-Admin-Soybean/blob/83a83f72189565e4eff3f2ca074f558d82e907e5/apps/server/src/shared/exceptions/business.exception.ts)
- [Soybean 错误码文档生成](https://github.com/linlingqin77/Nest-Admin-Soybean/blob/83a83f72189565e4eff3f2ca074f558d82e907e5/apps/server/src/shared/response/error-codes.doc.ts)
- [Soybean Pino 配置](https://github.com/linlingqin77/Nest-Admin-Soybean/blob/83a83f72189565e4eff3f2ca074f558d82e907e5/apps/server/src/infrastructure/logging/pino-logger.config.ts)
- [Soybean CLS 上下文](https://github.com/linlingqin77/Nest-Admin-Soybean/blob/83a83f72189565e4eff3f2ca074f558d82e907e5/apps/server/src/tenant/context/cls.module.ts)
- [Soybean tracing 初始化](https://github.com/linlingqin77/Nest-Admin-Soybean/blob/83a83f72189565e4eff3f2ca074f558d82e907e5/apps/server/src/observability/tracing/tracing.service.ts)
- [Soybean 慢查询扩展](https://github.com/linlingqin77/Nest-Admin-Soybean/blob/83a83f72189565e4eff3f2ca074f558d82e907e5/apps/server/src/infrastructure/prisma/slow-query.extension.ts)

P0 和 P1 的“当前问题”均来自本仓库源码。乐观锁、病毒扫描、供应商切换、Passkey、SAML、Outbox 等属于额外的现代化建议，本文件不声称两个参考仓库已经完整实现它们。

---

# P0：上线前阻断项

## S0-01 修复 Redis Session Lua 脚本

### 当前问题

文件：

- apps/server/src/modules/auth/session/session.script.ts
- apps/server/src/modules/auth/session/session-store.service.ts

已确认存在四个独立错误：

1. 验证脚本使用了未定义的 idleTtlMS，而正确变量是 idleTtlMs。
   有效 Token 进入 Lua 后会尝试比较 nil 和数字，最终被转换成 503。
2. Session 不存在时返回 NOT_FUND，但 TypeScript 只识别 NOT_FOUND。
   即使修正上一项，正常的无效 Session 仍会被误判成 Redis 服务故障。
3. 创建脚本使用了未定义、也没有通过 ARGV 传入的 sessionKeyPrefix。
   同一终端第二次登录、准备删除旧 Session 时会报错。
4. revoke 脚本把 Lua 关键字 do 写成了大写 DO。
   revokeAllForUser 一旦被调用，脚本会出现语法错误。

创建脚本在报错前已经执行了 HSET、SET 等写操作。Redis Lua 的执行具有原子隔离，但脚本错误不会自动回滚之前已经执行的写操作，因此可能出现“接口返回失败，但部分新会话数据已经写入”的状态。

### TODO

- [ ] 将 idleTtlMS 统一修正为 idleTtlMs。
- [ ] 将 NOT_FUND 统一修正为 NOT_FOUND。
- [ ] 为创建脚本显式传入 Session Key 前缀，或者重构参数使脚本不依赖未声明变量。
- [ ] 将 revoke 脚本中的 DO 改为 do。
- [ ] 把 Lua 返回码集中定义，避免 TypeScript 与 Lua 各写一份字符串。
- [ ] 删除 SessionStoreService 中 terminal: any，恢复 SessionTerminalType。
- [ ] 对脚本返回值增加严格长度和数字范围校验。
- [ ] 用真实 Redis 编写集成测试，不只测试字符串内容。

### 验收标准

- [ ] 首次登录成功。
- [ ] 同终端第二次登录成功，新 Token 有效，旧 Token 返回 401。
- [ ] 不同终端可以同时在线。
- [ ] 有效 Token 可以 validate 并滑动续期。
- [ ] 不存在、已替换、空闲过期、绝对过期的 Session 返回 401，而不是 503。
- [ ] Redis 不可用时返回 503。
- [ ] logout 不会删除同终端后来创建的新 Session。
- [ ] revokeAllForUser 可以撤销所有终端。
- [ ] 并发测试结束后，每个 Slot 指向的 digest 都有对应 Session Hash，每个有效 Session 也由正确 Slot 引用；不存在单边孤儿 Key。

## S0-02 移除生产运行时的 DB/Redis 测试接口

### 当前问题

AppModule 无条件导入：

- TestDbModule
- TestRedisModule

这两个模块不是自动化测试，而是真实运行的 HTTP Controller。

风险包括：

- GET /db/users 查询完整 users 行，会返回 passwordHash。
- POST /db/user 绕过 AuthService、PasswordService 和账号规范化，直接写数据库。
- POST /redis/set 可以修改任意 Redis Key。
- GET /redis/get 可以尝试读取任意 Redis Key。
- 系统没有 RBAC；任何通过公开注册得到账号的用户都拥有同样权限。
- Redis get 接口还把 @Query('key') 的字符串绑定给对象 DTO，接口本身存在参数绑定错误。

### TODO

- [ ] 从 AppModule 删除 TestDbModule 和 TestRedisModule。
- [ ] 删除这些运行时 Controller，或只在完全隔离的本地开发模块中启用。
- [ ] 不要用“已经登录”作为调试接口的安全边界。
- [ ] 数据库检查改为固定逻辑的 readiness probe。
- [ ] Redis 检查只执行固定 PING，不接受客户端提供 key、value 或 pattern。
- [ ] 全仓搜索任何返回 users 完整实体的接口。
- [ ] 为所有公开响应增加 passwordHash 永不出现的测试。

### 验收标准

- [ ] 生产路由中不存在 /db、/db/users、/db/user、/redis/set、/redis/get。
- [ ] 普通用户无法直接访问数据库或 Redis 调试能力。
- [ ] 任何响应、日志和 Swagger schema 都不包含 passwordHash。

## S0-03 处理已经提交的环境文件和密钥

### 当前问题

Git 当前跟踪：

- apps/server/.env.development
- apps/server/.env.production

其中包含已经赋值的数据库、Redis、JWT、LLM 等配置。无论这些值是不是当前生产值，都不应该把真实凭据长期放在仓库中。

另外：

- 当前认证已经采用 Redis Session，但环境文件仍保留 JWT_SECRET。
- session.config.ts 强制要求 SESSION_TOKEN_PEPPER。
- 仓库提供的 production 环境文件没有该变量；如果部署平台不额外注入，应用会启动失败。

### TODO

- [ ] 判断所有已提交值是否曾被真实环境使用。
- [ ] 只要无法证明是假值，就按泄露处理并立即轮换。
- [ ] 从 Git 跟踪中移除真实 .env.development 和 .env.production。
- [ ] 增加不含真实值的 .env.example。
- [ ] 生产密钥改由部署平台 Secret、Vault、KMS 或环境注入。
- [ ] 不要通过“把 SESSION_TOKEN_PEPPER 写进已跟踪 production 文件”修复启动问题。
- [ ] 删除已经不使用的 JWT_SECRET。
- [ ] 为 SESSION_TOKEN_PEPPER 建立轮换策略；轮换会让旧 Session 失效，需要明确发布行为。
- [ ] 如已提交真实密钥，评估是否需要清理 Git 历史。
- [ ] 在 CI 中运行选定的 secret scanner，并维护经过审查的 allowlist。

### 验收标准

- [ ] Git 不再跟踪任何真实数据库、Redis、LLM 或 Session 密钥。
- [ ] 新开发者可以从 .env.example 理解全部必需配置。
- [ ] 缺少必需变量时应用在启动阶段明确失败。
- [ ] 测试、预发布、生产使用不同密钥。
- [ ] Secret scanner 对当前提交和受支持的 Git 历史范围返回 0 个未豁免发现。

## S0-04 修正生产依赖和启动命令

### 当前问题

apps/server/package.json 中：

- @nestjs/swagger 被 main.ts 和 Controller 在运行时导入，却位于 devDependencies。
- shared/utils 被认证和 Session 代码在运行时导入，但 shared 位于 devDependencies。
- build:preview 执行 node dist/main。
- 当前实际构建入口位于 dist/src/main.js，build:preview 已实测出现 MODULE_NOT_FOUND。

仅安装生产依赖或在多阶段镜像中裁剪 devDependencies 后，Server 可能无法启动。

### TODO

- [ ] 把运行时需要的 shared 移到 dependencies。
- [ ] 把 @nestjs/swagger 移到 dependencies；当前 Controller 装饰器也会在模块加载时导入它，仅仅关闭 Swagger UI 不能消除运行时依赖。
- [ ] 检查 Swagger UI 在 Fastify 下对 @fastify/static 的运行时要求，并按实际启动路径调整依赖分类。
- [ ] 生产环境通过配置关闭文档生成和 /api-docs，但保留当前装饰器架构所需的运行依赖。
- [ ] 只有重构掉生产 bundle 中的全部 Swagger 装饰器/import 后，才可以考虑从生产依赖移除 @nestjs/swagger。
- [ ] 修正构建输出目录或把生产启动命令改为实际入口。
- [ ] 增加明确的 start:prod 脚本。
- [ ] 统一 build、preview、Docker CMD 和部署平台启动命令。
- [ ] 使用仅 production dependencies 的干净环境验证启动。

### 验收标准

- [ ] vp run --filter server build 成功。
- [ ] 生产启动脚本能真正启动 dist 产物。
- [ ] 删除 devDependencies 后仍能启动生产 Server。
- [ ] shared 已构建并随发布产物提供。

## S0-05 把数据库迁移纳入版本控制

### 当前问题

本地已经存在 apps/server/drizzle 下的 SQL 和 meta 文件，但 apps/server/.gitignore 忽略整个 drizzle 目录，当前没有任何迁移进入 Git。

这意味着：

- 新环境无法从空数据库重复构建相同 schema。
- CI 无法验证迁移。
- 多人开发时数据库状态只能依赖手工 db:push。
- 回滚、审计和发布顺序不可追踪。

### TODO

- [ ] 从 apps/server/.gitignore 删除对整个 drizzle 目录的忽略。
- [ ] 提交 SQL、journal 和 snapshot。
- [ ] 明确开发使用 db:generate + db:migrate 的流程。
- [ ] 禁止生产部署依赖 db:push。
- [ ] 增加从空数据库执行所有迁移的 CI 测试。
- [ ] 增加初始化管理员或基础权限数据的可重复 seed 方案。
- [ ] 迁移任务只能由一个发布 Job 执行，不要由每个应用副本无锁执行。

### 验收标准

- [ ] 克隆仓库后可以在空 PostgreSQL 上完整迁移。
- [ ] 应用启动不负责并发执行 schema 迁移。
- [ ] CI 会检测未提交迁移和 schema 漂移。

## S0-06 落地统一异常、requestId 和安全响应

### 当前问题

当前只有 ResponseInterceptor 包装成功响应，没有 APP_FILTER。

实际会出现多种失败格式：

- 普通 HttpException。
- 带对象 response 的认证异常。
- ZodValidationException。
- 未知 Error。
- Redis ServiceUnavailableException。

同时没有：

- 稳定错误码目录。
- requestId。
- 统一 validation details。
- cause 链。
- 5xx 日志脱敏。
- 401 Bearer challenge。
- 前端只对 Session 401 清理登录态的约束。

### TODO

- [ ] 完整实施 04.exception.md。
- [ ] 业务失败使用真实 4xx/5xx，禁止 HTTP 200 表示失败。
- [ ] 错误码使用稳定、带命名空间的字符串。
- [ ] 未知 500 永不向客户端返回内部 message、stack、SQL 或连接信息。
- [ ] 401 与 Bearer challenge 保持 RFC 语义。
- [ ] 当前项目契约把普通 JSON 登录凭据错误定义为 422，并通过稳定错误码避免误触发 Session 过期处理。
- [ ] 如果未来改成 OAuth 2.0 Token Endpoint，重新按对应规范评估 400 invalid_grant，不把 422 当成所有认证系统的唯一答案。
- [ ] 429/503 的 Retry-After 由真正知道重试窗口的组件设置。
- [ ] 未处理的 HTTP 5xx 技术异常只在 HTTP 边界记录一次；启动、后台任务、RPC/WS 和安全审计使用各自独立边界。

### 验收标准

- [ ] 400、401、403、404、409、422、429、503、500 都符合统一契约。
- [ ] 响应头、错误体和日志中的 requestId 一致。
- [ ] 500 响应不泄露内部信息。
- [ ] Session 401 含 WWW-Authenticate。
- [ ] 登录 422 不含 Bearer challenge。

## S0-07 阻止公开注册和登录接口被滥用

### 当前问题

- 注册接口完全公开。
- 登录和注册没有限流。
- 用户不存在或状态不可用时直接返回，不执行 Argon2 verify。
- 错误密码路径会执行 Argon2，因此可以通过耗时差异推测账号是否存在。
- Argon2 是高成本操作，没有限流时也可能成为计算型 DoS 入口。

### TODO

- [ ] 明确管理后台是否允许任何人公开注册。
- [ ] 如果不允许，改成管理员创建、邀请注册或初始化一次性超级管理员。
- [ ] 登录按账号和 IP 两个维度限流。
- [ ] 注册按 IP、设备和业务标识限流。
- [ ] 账号不存在时验证固定 dummy Argon2 hash。
- [ ] 登录失败使用统一响应，不暴露账号存在、锁定或禁用的具体原因。
- [ ] 增加渐进延迟或短期锁定，但避免永久锁死成为 DoS 手段。
- [ ] 429 返回安全文案和 Retry-After。
- [ ] 记录登录成功、失败、锁定和限流安全事件。

### 验收标准

- [ ] 单元测试证明“不存在账号”分支也调用固定 dummy Argon2 verify，并与错误密码返回完全相同的 HTTP 状态、错误码和公开文案。
- [ ] 在固定测试机预热后各采样至少 100 次，不存在账号与错误密码的中位耗时不得出现数量级差异；阈值由项目基准测试记录，而不是写死为跨机器通用值。
- [ ] 并发爆破请求会被限流。
- [ ] 普通访客不能自行获得管理后台账号，除非产品明确允许。

---

# P1：生产级后端基线

## S1-01 建立统一、强类型、启动即校验的配置系统

### 当前缺口

- ConfigModule.forRoot 没有统一 validate/schema。
- PORT、DB_PORT、REDIS_PORT 可能被解析为 NaN。
- 数据库、Redis 必填项不能在启动阶段完整校验。
- main.ts 直接读取 process.env，没有使用 appConfig。
- Drizzle CLI 使用 DATABASE_URL，运行时 Pool 使用 DB_HOST、DB_PORT 等另一套配置。
- llm.config.ts 被加载，但当前没有任何消费者。

### TODO

- [ ] 使用 Zod 建立完整 EnvSchema。
- [ ] 在 ConfigModule 启动时一次性 fail fast。
- [ ] DATABASE_URL 与分散 DB 字段只保留一个事实源。
- [ ] main.ts 通过 ConfigService 读取 host、port、environment。
- [ ] 校验端口范围、URL、TTL 关系、密钥长度和枚举值。
- [ ] 删除没有消费者的 JWT、LLM 等遗留配置，或实现对应模块后再加入。
- [ ] 为 development、test、production 明确必需项和默认值策略。

## S1-02 完成 PostgreSQL 数据层生命周期

### 当前缺口

- Pool 只在工厂函数中创建，没有单独 provider，也没有关闭钩子。
- 没有 SSL、connection timeout、statement timeout、pool max、idle timeout。
- 没有 application_name。
- 没有通用 PostgreSQL SQLSTATE 映射。
- createdAt 和 updatedAt 的时区类型不一致。
- updatedAt 不会自动更新。

### TODO

- [ ] 将 Pool 作为独立 provider 暴露。
- [ ] 在 OnApplicationShutdown 或 OnModuleDestroy 中调用 pool.end。
- [ ] 根据环境配置 SSL、连接池大小和超时。
- [ ] 统一使用 UTC/timestamptz。
- [ ] 为 updatedAt 建立可靠的自动更新策略。
- [ ] 根据已确认的查询计划、排序和关联场景增加索引，并用 EXPLAIN/集成基准验证；不要无条件给所有字段加索引。
- [ ] 只有出现跨 Repository 事务时再建立 transaction helper 或 Unit of Work 约定。
- [ ] 按 SQLSTATE 集中映射错误：
  - 23505 唯一约束：409。
  - 23503 外键约束：根据“资源冲突”或“输入语义无效”映射为 409/422，不做全局硬编码。
  - 40001 序列化失败：只在完整、可幂等重放的事务边界有限重试。
  - 40P01 死锁：只在完整、可幂等重放的事务边界有限重试。
- [ ] 40001/40P01 重试耗尽后的 409、503 或其他状态由具体操作语义决定。
- [ ] 不解析数据库 message 判断错误类型。

## S1-03 增加健康检查、启动边界和优雅停机

### 当前缺口

- 根路径仍返回 Hello World。
- 没有 /health/live。
- 没有 /health/ready。
- /db 和 /redis/ping 是受保护调试路由，不是健康检查。
- bootstrap 末尾只有 void bootstrap()，没有明确的启动失败处理。
- 没有 enableShutdownHooks。
- 数据库 Pool 没有关闭。

### TODO

- [ ] 提供轻量 liveness，只表示进程事件循环仍工作。
- [ ] 提供 readiness，检查 PostgreSQL 和 Redis，并设置严格超时。
- [ ] readiness 失败时返回非健康状态，由负载均衡器或编排器摘除实例。
- [ ] 启用 Nest shutdown hooks。
- [ ] SIGTERM 进入独立 draining 流程：先让 readiness 失败并等待流量摘除，再关闭 HTTP、Redis、PostgreSQL。
- [ ] bootstrap 失败记录结构化 fatal 日志并设置非零退出码。
- [ ] Docker Compose 和生产编排使用 healthcheck，而不是固定 sleep。

## S1-04 建立 requestId、结构化日志和安全审计

边界说明：S0-06 只完成 requestId 的生成、错误响应和 HTTP 异常关联；本节把它扩展到访问日志、应用上下文、统一脱敏和安全事件。可查询的长期审计管理模块放在 S2-04。

### 当前缺口

- Fastify request logger 未开启。
- 没有可信 requestId。
- 没有请求耗时、route template、status、error code 访问日志。
- 没有统一嵌套脱敏。
- 没有登录与权限安全审计。

### TODO

- [ ] 由 Server 生成 UUID/ULID requestId。
- [ ] 如接收入站 requestId，只接受受限格式和长度，否则重新生成。
- [ ] 响应头、错误体、日志使用同一个 requestId。
- [ ] 使用 Pino 或等价结构化日志。
- [ ] 日志记录 route template，不记录原始 URL/query。
- [ ] 默认不记录 request/response body。
- [ ] 深层脱敏 Authorization、Cookie、Token、密码、密钥、连接串和 PII。
- [ ] 5xx 保留有限 cause 链，4xx 不默认打印 stack。
- [ ] 增加登录成功、失败、登出、踢人、改密、权限拒绝审计事件。
- [ ] 定义日志保留周期、查询权限和删除策略。

## S1-05 完成 HTTP 安全基线

### 当前缺口

- CORS origin 为通配。
- Swagger 在所有环境公开。
- trustProxy 固定为本地回环地址。
- 没有 Helmet。
- 没有全局与接口级限流。
- 没有明确 body 大小、请求超时和响应压缩策略。

### TODO

- [ ] 生产 CORS 使用配置化 allowlist。
- [ ] 只暴露实际需要的 headers 和 methods。
- [ ] Swagger 在生产关闭，或使用独立鉴权。
- [ ] 启用 Fastify Helmet，并根据前端部署调整 CSP。
- [ ] 配置全局基础限流和登录专项限流。
- [ ] trustProxy 根据真实代理拓扑配置，不能盲目信任所有来源。
- [ ] 限制 JSON、表单和上传 body 大小。
- [ ] 为慢请求设置应用和下游超时，但不能把 RxJS timeout 当成取消数据库操作。
- [ ] Bearer Header 模式不需要 CSRF Token；如果以后改用 Cookie，再增加 SameSite、Secure 和 CSRF 防护。

## S1-06 补齐账号和 Session 生命周期

### 当前缺口

- revokeAllForUser 已存在，但没有任何调用方或 API。
- 禁用、锁定用户后，已有 Session 不会自动撤销。
- Guard 只验证 Redis 中的 userId 和 terminal。
- 没有改密后的强制撤销和用户主动退出全部终端。
- 没有 Argon2 参数版本和 needsRehash。

### TODO

- [ ] 增加修改密码接口。
- [ ] 改密、禁用、锁定、删除用户后撤销全部 Session。
- [ ] 增加当前用户退出全部终端。
- [ ] 明确普通接口多久重新确认用户状态。
- [ ] 为关键接口提供强制回源确认策略。
- [ ] 显式配置并基准测试 Argon2id 参数。
- [ ] 参数升级后在登录成功时执行 needsRehash。
- [ ] 原始 Token、Token digest、密码和 passwordHash 永不进入日志。

管理员重置密码、在线终端列表和踢指定设备属于管理产品能力，放在 S2-01 与 S2-10。

注意：当前 Opaque Redis Session 适合强撤销需求，不需要因为参考项目使用 JWT 就改成 JWT + Refresh Token。应先把现有 Session 做正确。

## S1-07 建立最小授权内核

### 当前缺口

当前只有“是否登录”，没有：

- 管理员与普通用户边界。
- 默认拒绝的敏感路由策略。
- 最小权限码和权限 Guard。
- Resource ownership 检查约定。

### TODO

- [ ] 先定义最小、稳定权限码，例如 system.user.read。
- [ ] 增加 Permissions 装饰器和 Guard/Policy。
- [ ] 管理模块采用默认拒绝；未声明权限不能自动放行。
- [ ] 超级管理员能力必须显式、可审计。
- [ ] 第一阶段可以使用受控静态策略或最小角色字段，但不能继续让所有登录用户权限相同。
- [ ] 涉及单条资源时同时检查权限和数据归属。
- [ ] 为每个敏感 Controller 建立权限契约测试。

完整动态角色表、权限关联、缓存失效以及公司/租户模型放在 S2-02 与 S2-03。当前 CORS 已允许 X-Company-Id，但 Server 没有任何公司校验；在 S2-03 完成前不要让业务依赖该 Header。

## S1-08 让响应 schema 和 OpenAPI 真正成为契约

### 当前缺口

虽然全局注册了 ZodSerializerInterceptor，但全仓没有使用运行时响应 DTO 元数据，因此“响应防泄漏”实际上没有形成覆盖。

### TODO

- [ ] 至少为 auth/me、注册、登录等敏感接口声明运行时响应 schema。
- [ ] 为统一成功响应和失败响应定义基础 schema。
- [ ] 不依赖 TypeScript 返回类型做运行时脱敏。
- [ ] shared ApiResponse 增加稳定字符串 code、requestId 和受限 details。
- [ ] Auth 与基础错误端点的 OpenAPI 声明覆盖实际状态码。
- [ ] 故意向 Service 结果插入 passwordHash，测试应证明响应不会泄漏。

全接口 schema、前端类型生成和 OpenAPI snapshot 属于 S2-11 的完整契约建设。

## S1-09 建立真正的 Server 自动化测试

### 当前缺口

- apps/server 没有 spec/test 文件。
- package.json 没有 test script。
- @nestjs/testing 已安装但没有使用。
- Nest SWC 构建关闭 typeCheck。
- package.json 的 format 仍调用当前工作区没有配置的 Prettier。

### TODO

- [ ] 增加 Server 的 Vite/Vitest 配置和 test script。
- [ ] 使用 vp test，而不是 Jest 命令。
- [ ] 单元测试覆盖错误目录、Guard、Service、Repository mapper。
- [ ] 使用 Fastify inject 编写 HTTP 集成测试。
- [ ] 使用真实 PostgreSQL/Redis 测试关键基础设施。
- [ ] Redis Lua 测试覆盖并发和竞态。
- [ ] 测试 passwordHash、Token、stack 和连接串不会泄漏。
- [ ] 测试 requestId 并发不串线。
- [ ] 测试 RBAC 默认拒绝。
- [ ] 为关键路径设置覆盖率门槛。
- [ ] 修正 Server format script，统一使用 Vite+ Oxfmt。

## S1-10 建立发布与 CI/CD 闭环

### TODO

- [ ] 增加多阶段 Server Dockerfile。
- [ ] 使用非 root 用户运行。
- [ ] 镜像只包含运行依赖和必要构建产物。
- [ ] 不把 .env 或 Secret 复制进镜像。
- [ ] 发布前独立执行数据库迁移。
- [ ] CI 执行 vp install、shared build、vp check、workspace test、workspace build。
- [ ] CI 从空数据库验证迁移。
- [ ] CI 使用生产依赖镜像实际启动 Server 并检查 readiness。
- [ ] 增加会自动启动、限时轮询 readiness、终止子进程并返回退出码的 bounded smoke script。
- [ ] 建立回滚、数据库备份和恢复演练。
- [ ] docker-compose.yml 明确标记为开发环境。
- [ ] 开发 Compose 不使用 latest 镜像标签，并加入 healthcheck。
- [ ] 生产不直接公开 PostgreSQL、Redis 和 MinIO 管理端口。

## S1-11 建立首个生产环境所需的最小指标与告警

完整分布式追踪可以后置，但首个生产环境不能只有日志。

### TODO

- [ ] 采集 HTTP request count、duration 和 error rate，route 使用模板而不是原始 URL。
- [ ] 按 HTTP status 和稳定 error code 聚合失败。
- [ ] 监控 PostgreSQL pool 使用量、等待数和连接失败。
- [ ] 监控 Redis 连接状态、命令延迟和错误。
- [ ] 聚合未知 5xx，并建立错误率与 readiness 告警。
- [ ] 登录失败、限流和权限拒绝建立安全告警，但控制标签基数。
- [ ] 为每个告警编写负责人、影响判断和处理步骤。

## P1 自动化验收矩阵

| 能力            | 可执行验收                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| 配置            | 表驱动测试逐个删除或破坏必需变量，应用必须在监听端口前失败并指出变量名                               |
| 数据库生命周期  | 集成测试启动应用后发送 SIGTERM，Pool 在超时内结束且进程以预期状态退出                                |
| 健康检查        | 正常时 ready=200；断开 Redis 或 PostgreSQL 时 ready 非 2xx、live 仍为 200；恢复后 ready 回到 200     |
| requestId       | 并发请求的响应头、错误体、访问日志一一对应，没有串号                                                 |
| 日志脱敏        | 属性测试覆盖对象、数组、大小写变体和 CR/LF，输出中不存在测试 Token、密码、Cookie、连接串             |
| CORS 与 Swagger | Fastify e2e 覆盖允许/拒绝 Origin；production 配置下 /api-docs 不可匿名访问                           |
| Session 强撤销  | 禁用、锁定或改密事务完成后，旧 Token 的下一次请求返回 Session 401                                    |
| 最小授权        | 路由矩阵测试证明匿名=401、已登录无权限=403、有权限=成功，未声明权限的管理路由默认拒绝                |
| 响应防泄漏      | Service 故意返回 passwordHash，外部响应中仍不存在该字段                                              |
| 测试接入        | vp run --filter server test 能实际发现并执行 Server 测试，失败测试使进程非零退出                     |
| 生产镜像        | 仅安装 production dependencies 的镜像启动成功，迁移完成后 bounded smoke test 能探测 ready 并终止进程 |
| 指标与告警      | 测试请求能产生预期 RED 指标；模拟未知 5xx 与依赖故障能触发测试告警规则                               |

---

# P2：完整管理后台能力

以下能力是 nest-admin 一类成熟管理后台通常具备，而当前项目尚未实现的部分。是否全部实施取决于产品范围。

## S2-01 用户管理

- [ ] 分页查询用户。
- [ ] 创建、编辑、禁用、锁定和软删除用户。
- [ ] 管理员重置密码。
- [ ] 修改用户状态时撤销 Session。
- [ ] 查询用户角色、公司、部门和在线状态。
- [ ] 所有列表明确 select 字段，永不返回 passwordHash。
- [ ] 增加乐观锁或版本字段，避免后台多人覆盖修改。

## S2-02 角色、权限和动态菜单

- [ ] 建立 role、permission、user_role、role_permission 等迁移。
- [ ] 角色 CRUD。
- [ ] 权限码目录。
- [ ] 角色与权限关联。
- [ ] 用户与角色关联。
- [ ] 菜单与路由元数据。
- [ ] 菜单只负责展示，后端权限 Guard 才是安全边界。
- [ ] 权限变更审计。
- [ ] 权限缓存使用版本号或明确失效事件；测试证明变更后不会长期沿用旧权限。
- [ ] 明确权限变更是否立即撤销 Session，或让下一次强校验刷新授权状态。
- [ ] 初始化超级管理员和最小角色。

## S2-03 公司、部门、岗位或租户

- [ ] 先确认产品是否真的需要多公司或多租户。
- [ ] 需要时建立 company/tenant、membership、department 等表。
- [ ] 当前公司必须由服务端验证。
- [ ] Repository 查询默认带租户条件。
- [ ] 唯一索引包含租户边界。
- [ ] 增加跨租户越权测试。
- [ ] 不要因为 Soybean 有 tenant 模块就盲目引入。

## S2-04 操作日志、登录日志和安全审计

P1 先保证安全事件会被结构化记录和告警；本节建设可持久化、可查询、受权限控制的管理模块。

- [ ] 登录成功与失败日志。
- [ ] 注册、登出、踢人、改密日志。
- [ ] 管理员增删改操作日志。
- [ ] 记录操作对象、结果、requestId 和受控用户标识。
- [ ] 不保存原始请求 body、密码、Token 或敏感字段。
- [ ] 支持分页查询、权限控制和保留周期。

## S2-05 字典、系统配置和 Feature Flag

- [ ] 公共字典与状态码配置。
- [ ] 系统参数配置。
- [ ] 配置变更审计。
- [ ] 敏感配置不进入普通配置表。
- [ ] Feature Flag 有默认值、作用域和回滚能力。

## S2-06 文件上传与 MinIO

当前 docker-compose.yml 已启动 MinIO，但 Server 完全没有对象存储模块。

- [ ] 定义 StoragePort，避免业务直接依赖 MinIO SDK。
- [ ] 限制文件大小、类型和扩展名。
- [ ] 服务端重新生成对象 Key，不能信任客户端文件名。
- [ ] 私有文件使用短期签名 URL。
- [ ] 增加病毒扫描或异步安全检查。
- [ ] 记录文件所有者、租户、用途和生命周期。
- [ ] 删除业务记录时处理对象清理和失败补偿。

## S2-07 定时任务、队列和 Worker

- [ ] 明确哪些任务需要异步化。
- [ ] 选择 BullMQ 或其他队列后建立统一 Job 契约。
- [ ] Job 必须幂等。
- [ ] 设置有限重试、指数退避、超时和 DLQ。
- [ ] 记录 jobId、requestId、错误码和最终状态。
- [ ] 多副本定时任务必须加分布式锁或独立 Scheduler。
- [ ] 提供失败任务查看和人工重试能力。

## S2-08 通知、邮件和站内消息

- [ ] 通知模板。
- [ ] 站内消息。
- [ ] 邮件或短信适配器。
- [ ] 发送任务进入队列。
- [ ] 失败重试和供应商切换。
- [ ] 退订、频控和审计。

## S2-09 导入、导出和批量操作

- [ ] 大文件异步处理。
- [ ] 导入逐行错误报告。
- [ ] 导出权限与字段脱敏。
- [ ] 批量操作幂等。
- [ ] 限制数据量，避免阻塞 HTTP 进程。

## S2-10 在线会话与后台控制台

- [ ] 查询用户当前终端列表。
- [ ] 管理员踢指定终端。
- [ ] 管理员撤销用户全部会话。
- [ ] 展示登录时间、最近活动时间、脱敏 IP 和 User-Agent。
- [ ] 在线状态只是近似值，不能当权限依据。

## S2-11 完整 API 契约与客户端类型

- [ ] 所有公开接口声明运行时成功响应 schema。
- [ ] OpenAPI 声明 400、401、403、404、409、422、429、500、503。
- [ ] 生成 React/Vue 共用的客户端协议类型。
- [ ] 增加 OpenAPI snapshot/contract test。
- [ ] 定义字段和错误码的兼容、弃用与迁移规则。
- [ ] 文档与运行时响应不一致时让 CI 失败。

## S2-12 Dashboard、统计与报表

- [ ] 只提供有明确业务含义的聚合指标。
- [ ] 统计查询具备时间范围、分页或上限。
- [ ] 大查询进入异步任务或报表库，不阻塞主业务数据库。
- [ ] 统计结果遵守角色、租户和数据范围权限。
- [ ] 为昂贵聚合建立缓存失效与容量策略。

## P2 统一验收标准

- [ ] 每个新增模块都有迁移、DTO、Service/Repository、权限码和响应 schema。
- [ ] 路由矩阵覆盖匿名、无权限、有权限、跨数据范围四类请求。
- [ ] 列表接口有默认上限和最大上限，空条件请求不能无限返回全表。
- [ ] 敏感变更产生可查询审计事件。
- [ ] 文件、队列、通知等外部依赖失败时有稳定错误码和补偿/重试规则。
- [ ] OpenAPI 契约和 e2e 测试随模块一起提交。
- [ ] 对应模块未被产品选择时保持未实现，不为了勾选清单引入空壳依赖。

---

# P3：按规模和产品需要实施

## S3-01 OpenTelemetry、跨服务追踪和高级错误聚合

- [ ] OTel instrumentation 在 Nest、Fastify、HTTP 和数据库模块导入前启动。
- [ ] 日志自动关联 traceId 和 spanId。
- [ ] 定义采样策略、跨服务传播和敏感属性过滤。
- [ ] Trace、日志和 P1 基础指标使用同一服务与环境标识。
- [ ] 只把未知 5xx 上报 Sentry，避免 Filter、OTel、Sentry 重复记录。
- [ ] 在引入消息队列或其他服务后验证异步上下文传播。

## S3-02 MFA、SSO 与企业身份

- [ ] 产品明确需要后再实现 TOTP、Passkey、OIDC 或 SAML。
- [ ] MFA 恢复码必须加密或哈希保存。
- [ ] SSO 账号绑定和离职撤销必须可审计。
- [ ] 不把验证码当成唯一的登录防护。

## S3-03 Session 扩展与 Redis 高可用

当前每次受保护请求都会写 Redis 续期，高流量时存在写放大。

- [ ] 评估按时间窗口节流续期写入。
- [ ] 明确 Redis 持久化、maxmemory、noeviction 和容量告警。
- [ ] 如迁移 Redis Cluster，为多 Key Lua 设计 hash tag。
- [ ] 评估 Sentinel、Cluster 或托管 Redis。
- [ ] 定义 Redis 故障时认证是 fail closed 还是有限降级。

## S3-04 多传输层错误 Presenter

- [ ] 只有引入 GraphQL 时才实现 GraphQL extensions 错误格式。
- [ ] 只有引入 WebSocket 时才实现 WsExceptionFilter。
- [ ] 只有引入微服务 Transport 时才实现 RpcExceptionFilter。
- [ ] 不让 HTTP Filter 盲目处理所有 ArgumentsHost 类型。

## S3-05 幂等、Outbox 与分布式一致性

- [ ] 对支付、创建订单、批量提交等关键写接口使用调用方 Idempotency-Key。
- [ ] 幂等状态必须包含用户或租户作用域。
- [ ] 使用 Redis 原子状态机或数据库唯一约束。
- [ ] 出现跨系统事件后再引入 Outbox。
- [ ] Worker 支持 claim、lease、重试和死信。

## S3-06 API 版本化与兼容策略

- [ ] 在 API 对外稳定或存在多版本客户端前决定 URI、Header 或媒体类型版本策略。
- [ ] 定义错误码和响应字段的兼容规则。
- [ ] 定义弃用通知、支持窗口和删除条件。
- [ ] 契约测试覆盖仍在支持期内的旧客户端。
- [ ] 不仅修改 Swagger 的版本文字，运行时路由和兼容行为必须一致。

## P3 实施门槛

- [ ] 有明确产品需求、SLO、合规要求或容量数据支持实施。
- [ ] 先写 ADR，说明不实施、简单方案和复杂方案的取舍。
- [ ] 有负载、故障或兼容测试证明新复杂度解决了真实问题。
- [ ] 有成本、回滚、运维负责人和告警策略。

---

# 3. 不建议从参考项目照搬的做法

## 3.1 不要返回 HTTP 200 表示业务失败

业务码与 HTTP 状态是两层协议：

- HTTP 表示传输和通用语义。
- 稳定错误码表示具体业务原因。

不要让网关、缓存、监控和浏览器把失败统计成成功。

## 3.2 不要用 code:message 字符串再 split

错误码、公开文案、HTTP 状态、是否可重试应是结构化字段。

也不要把 HTTP 数字 200/400/500 和业务数字 1000+ 混在同一个错误码枚举中；客户端应依赖稳定的命名空间字符串。

## 3.3 不要把 Express Response 写死在 Filter

当前项目使用 Fastify，应通过 HttpAdapterHost 或明确的 Fastify 接口实现。

## 3.4 不要信任客户端 requestId

客户端值必须限制格式和长度；不符合规则时重新生成。

requestId 只能有一套实际生效的生成与上下文传播机制，避免中间件和 CLS 各自生成、造成同一请求出现两个 ID。

## 3.5 不要向客户端返回 stack

即使 development 环境也可能部署在共享测试服务器。stack、SQL、连接串和内部路径永远只进入受控日志。

## 3.6 不要记录原始数据库参数或完整 body

密码、Token、Cookie、Authorization、身份证件和业务 PII 都可能被写入日志。

## 3.7 不要同时维护 JWT 和 Redis Session 两套登录架构

当前代码已经选择 Opaque Redis Session。除非产品边界变化，否则先修好这一套，并把 JWT 文档标记为备选方案。

## 3.8 RBAC 不要默认放行

管理模块应默认拒绝。未声明权限的敏感路由不能自动允许所有登录用户。

## 3.9 不要让每个副本启动时自动跑迁移

多副本同时启动可能发生竞态。迁移应由单独发布 Job 执行。

## 3.10 不要因为参考项目功能多就全部实现

多租户、MFA、队列、GraphQL、WebSocket、Outbox 都应由真实产品需求驱动。

## 3.11 不要记录完整 ORM 参数和慢查询输入

慢查询日志可以记录 query name、耗时、表或受控摘要，不能默认保存 Prisma args、Drizzle 参数、原始 SQL 值或完整业务对象。

## 3.12 不要在应用模块加载后才初始化 OTel

自动插桩必须在 Nest、Fastify、HTTP、数据库客户端等应用模块之前加载。放在普通 Service 的 onModuleInit 中可能错过模块加载阶段。

## 3.13 不要直接复制不同技术栈的基础设施代码

参考仓库中的 Nest 版本、Express、Prisma、TypeORM 或其他适配代码不能原样搬入当前 NestJS 11 + Fastify + Drizzle 项目。应保留契约与边界，重新实现适配层。

---

# 4. 推荐施工顺序

## 阶段 A：立即止血

- [ ] S0-02 移除 DB/Redis 运行时测试接口。
- [ ] S0-03 轮换并移除已提交密钥。
- [ ] S0-01 修复 Session Lua。
- [ ] S0-04 修正生产依赖和启动命令。
- [ ] S0-05 提交数据库迁移。

交付标准：现有认证闭环真实可用，生产构建可以启动，不存在明显敏感接口。

## 阶段 B：建立安全基础设施

- [ ] S0-06 统一异常与 requestId。
- [ ] S0-07 登录限流与抗枚举。
- [ ] S1-01 配置校验。
- [ ] S1-02 数据库生命周期。
- [ ] S1-03 健康检查与停机。
- [ ] S1-04 结构化日志。
- [ ] S1-05 HTTP 安全。
- [ ] S1-09 自动化测试。
- [ ] S1-10 发布与 CI/CD。
- [ ] S1-11 最小指标与告警。

交付标准：可以部署到第一套受控测试环境，并能够定位问题、正确退出和安全失败。

## 阶段 C：形成管理后台

- [ ] S1-06 账号与 Session 生命周期。
- [ ] S1-07 最小授权内核。
- [ ] S1-08 响应与 OpenAPI 契约。
- [ ] S2-01 用户管理。
- [ ] S2-02 角色、权限和菜单。
- [ ] S2-04 审计。

交付标准：管理员与普通用户权限清晰，敏感操作可追踪。

## 阶段 D：按产品扩展

- [ ] 公司/部门/租户。
- [ ] 字典和系统配置。
- [ ] MinIO 文件模块。
- [ ] 队列与定时任务。
- [ ] 通知、导入导出和在线会话。
- [ ] 分布式追踪、Sentry、SSO 或 MFA。

---

# 5. 最终生产基线完成标准

下面是完成阶段 A、B、C 后的最终生产基线，不是要求阶段 A 单独满足所有条目。阶段 A/B/C 各自的交付条件以前一节为准；阶段 D 的可选功能只在实际实施时应用对应测试。

- [ ] 有数据库迁移，不只修改 schema.ts。
- [ ] 有单元测试和 Fastify 集成测试。
- [ ] 有权限与越权测试。
- [ ] 有失败场景和并发场景测试。
- [ ] 响应不泄露 passwordHash、Token、stack、SQL 或连接串。
- [ ] OpenAPI 与运行时响应一致。
- [ ] 日志包含 requestId，且完成脱敏。
- [ ] 生产依赖安装可以启动。
- [ ] readiness 在依赖故障时正确失败。
- [ ] SIGTERM 可以优雅关闭。
- [ ] 没有重新引入 HTTP 200 业务错误。

全部基础改造完成后，从项目根目录执行：

```powershell
vp install
vp run --filter shared build
vp check
vp run -r test
vp run -r build
vp run --filter server smoke
```

smoke 必须是有超时且会自行终止 Server 的脚本，不能直接把长期运行的 build:preview 当作 CI 验收命令。当前仓库尚无 smoke script；完成 S0-04、S1-03 和 S1-10 后再加入。

---

# 6. 当前最值得先建立的自动化测试

按收益排序：

1. Redis Lua create、replace、validate、touch、logout、revoke 集成测试。
2. 普通用户无法访问任何调试或管理接口。
3. 所有响应永不出现 passwordHash。
4. 登录不存在账号与错误密码的耗时和响应一致。
5. Session 失效返回 401，Redis 故障返回 503。
6. 统一异常契约和 requestId。
7. PostgreSQL 唯一约束、外键和连接故障映射。
8. 用户禁用、改密后全部 Session 失效。
9. RBAC 默认拒绝与跨公司越权。
10. 生产依赖镜像启动和 readiness。

---

# 7. 参考资料

- [buqiyuan/nest-admin](https://github.com/buqiyuan/nest-admin)
- [linlingqin77/Nest-Admin-Soybean](https://github.com/linlingqin77/Nest-Admin-Soybean)
- [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
- [NestJS Lifecycle Events](https://docs.nestjs.com/fundamentals/lifecycle-events)
- [NestJS Authorization](https://docs.nestjs.com/security/authorization)
- [NestJS Rate Limiting](https://docs.nestjs.com/security/rate-limiting)
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [PostgreSQL Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html)

本清单的判断以当前源码为准。文档中已经设计但尚未进入 apps/server 的能力，仍然按“未实现”处理。
