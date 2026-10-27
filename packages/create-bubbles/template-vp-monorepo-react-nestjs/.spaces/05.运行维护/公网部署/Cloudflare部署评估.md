# Cloudflare 部署评估

状态：验证记录；兼容性评估、本地构建、Linux 启动探针及官方费用核算已完成，尚未部署到 Cloudflare。

核验日期：2026-10-27。范围及既有约束以[公网部署需求](./需求文档.md)为准。

## 验证目标

- 根据当前源码和运行依赖，判断前端、后端及配套服务可否部署到 Cloudflare。
- 区分“可经适配部署”“本地验证通过”和“已在云端运行”，不将代码阅读冒充云端验收。
- 按官方现行价格列出低流量演示和持续运行的费用条件，单独说明数据库、Redis、对象存储等配套成本。
- 不修改业务、接口、认证或数据结构，不读取或记录云端账号密钥，不创建付费资源。

## 结论

当前 React 前端可以使用 Cloudflare 静态托管；NestJS 后端经容器封装后可采用 Cloudflare Containers，并连接独立的 PostgreSQL、Redis 和对象存储。现有项目不能直接原样发布到普通 Workers，仓库也尚无本次方案需要的 Dockerfile、Wrangler 配置及云端服务配置。

本次已在本机 Linux 容器运行实际后端构建产物，验证原生密码摘要、摘要线程、基础设施连接和 HTTP 启动。这个结果支持容器部署方向，但不代表已经完成 Cloudflare 部署、全部业务验收或最小规格验证。

费用方面，5 美元／月只是 Workers Paid 的账户基础费。以一个 1 GiB 的 basic 容器连续运行 30 天为例，基础费加内存、磁盘超额约 11.93 美元，按测算汇率约 85.90 元，数据库和 Redis 等另计。以当前每月 50 元总预算，不能把该方案作为费用已确定的完整部署选择。

## 组件与部署方式

| 当前组件                            | Cloudflare 可用方向                            | 适配和验证边界                                                                                     |
| ----------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| React SPA                           | Workers Static Assets 或 Pages                 | 构建通过；需要 SPA 回退和生产 API 路由。静态托管可在免费额度内运行，API 执行另计                   |
| NestJS 12／Fastify                  | Containers 中的 Linux Node 进程                | 本地 Linux 启动通过；还需镜像、监听端口、入口 Worker、健康检查及密钥配置                           |
| 原生 `argon2`                       | Linux 容器原生模块                             | 本地 Linux 哈希及校验通过；不能据此认为普通 Workers 支持该原生依赖                                 |
| `node:worker_threads` 文件摘要      | Linux 容器真实线程                             | 构建产物中的 `sha256.worker.cjs` 实测通过；Workers 官方列为不可执行的 stub 模块                    |
| PostgreSQL／Drizzle `node-postgres` | 独立持久化 PostgreSQL                          | 本地只读 `SELECT 1` 通过；D1 不是当前驱动和 SQL 的直接替代                                         |
| 会话 Redis、BullMQ                  | 独立且兼容项目命令的 Redis；明确消费者运行策略 | 两个 Redis 连接 PING 通过；本轮关闭消费者，未验收任务消费、重试及休眠恢复。KV 不能直接替换这些服务 |
| S3 兼容存储                         | 评估 R2 或继续使用独立 S3 服务                 | 本地 MinIO `HeadBucket` 通过；尚未连接 R2，分片上传、条件读取及完整摘要流程需单独验证              |

Containers 磁盘默认是临时磁盘，实例休眠后重新启动使用镜像中的新磁盘。不能把现有 Compose 的 PostgreSQL、Redis、MinIO 直接放入这种磁盘并视为完成持久化。快照和对象存储挂载也不等同于已经验证可靠的数据库持久卷。

## 本地验证结果

核验环境：Windows 主机，Node 24.22.1，Vite+ 1.4.0；Linux 探针使用本机已缓存的 `node:24-alpine`，容器实际 Node 为 24.14.0、Linux x64。未创建云资源，未执行数据库迁移或业务写入。

| 检查                       | 结果                                                                                                                           | 证据                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 工作区依赖安装             | `vp install --frozen-lockfile --prefer-offline` 通过，未改锁文件                                                               | [安装日志](./测试证据/Cloudflare/依赖安装.log)                   |
| React 类型检查及构建       | `vp run --filter web build` 通过                                                                                               | [构建日志](./测试证据/Cloudflare/React构建.log)                  |
| NestJS／Rspack 构建        | `vp run --filter server build` 通过，包含摘要线程产物；保留已有模块类型警告                                                    | [构建日志](./测试证据/Cloudflare/NestJS构建.log)                 |
| 后端 TypeScript            | `pnpm exec tsc --noEmit` 在 `apps/server` 退出码 0                                                                             | [检查日志](./测试证据/Cloudflare/后端类型检查.log)（成功时为空） |
| 后端现有测试               | 99 项通过、43 项外部集成跳过、0 项失败，共 142 项；跳过不计为通过                                                              | [结构化测试报告](./测试证据/Cloudflare/后端测试.json)            |
| 静态文件规模               | 239 个文件、共 2,646,113 字节，最大单文件 309,772 字节；低于免费层 20,000 文件／单文件 25 MiB 限制                             | [资源统计](./测试证据/Cloudflare/前端静态资源.json)              |
| Linux 原生依赖和线程       | Argon2 使用项目同等参数，哈希及校验通过；实际构建线程对 `abc` 的 SHA-256 结果正确                                              | [Linux 结果](./测试证据/Cloudflare/Linux容器验证.json)           |
| Linux 基础连接及 HTTP 启动 | PostgreSQL `SELECT 1`、会话和队列 Redis PING、MinIO `HeadBucket` 通过；实际 `dist/main.js` 启动并返回 96 个路径的 OpenAPI JSON | [Linux 运行日志](./测试证据/Cloudflare/Linux容器运行.log)        |
| 验证工具                   | CJS 通过 `node --check` 与 `vp check`；PowerShell Parser 无语法错误                                                            | [检查结果](./测试证据/Cloudflare/验证工具检查.json)              |
| 临时资源清理               | 本次独立测试目录已删除，临时容器已退出并删除；仅清理本次随机前缀队列元数据                                                     | [清理记录](./测试证据/Cloudflare/临时目录清理.json)              |

Linux 验证工具：[PowerShell 入口](./工具/Cloudflare/验证Linux容器.ps1)、[Node 探针](./工具/Cloudflare/运行依赖探针.cjs)。探针只从本机开发配置中获取本地服务连接，密钥仅写入已删除的临时目录，不进入证据。隔离工程采用当前安装版本的精确直接依赖，传递依赖由 npm 重新解析；该结果不是 pnpm 锁文件的完整 Linux 安装复刻。[直接依赖版本](./测试证据/Cloudflare/Linux依赖清单.json)供复核。

本次只验证 React 应用 `apps/web`，未验证仓库中的 Vue 应用。测试中的外部集成跳过与 Linux 启动探针各有范围，二者均不能替代真实登录、权限、上传、队列及浏览器端到端验收。Linux 容器未限制为某个 Cloudflare 实例规格，也未压测，因此下列规格价格不代表项目已在对应内存及 CPU 下运行通过。

## 部署前需要完成的工作

1. **容器和入口配置**：编写镜像及 Wrangler／Containers 配置，明确容器监听端口、入口路由、健康检查、重启、日志和后台消费者生命周期。单纯调用 `app.listen()` 的当前 Node 入口不构成完整 Workers 部署入口；即使补入口，也仍需解决原生依赖和真实线程问题。
2. **运行依赖**：当前 `@nestjs/swagger`、`@fastify/static` 和工作区 `shared` 位于后端 `devDependencies`，构建产物运行仍需要它们。应在部署封装中正确携带，或后续调整依赖归属；不能直接裁剪开发依赖后假设可启动。本次 Linux 工程显式补齐了这三个依赖。
3. **生产环境变量**：当前后端 `.env.production` 缺少必需的 `STORAGE_*`、`SESSION_TOKEN_PEPPER` 等配置，不能直接按文件原样启动。数据库、Redis、存储和会话密钥需要按目标服务配置，不使用开发默认值。
4. **托管数据库和 Redis 接入**：当前数据库 Pool 工厂使用 `DB_*` 配置，没有将 `DATABASE_URL` 或 SSL 选项传给 Pool；现有 Redis 工厂没有 TLS 配置。应根据目标服务的连接及证书要求补齐配置并验证，不能仅修改一个连接串即视为迁移完成。
5. **前端构建和 API**：当前 `build` 脚本显式使用 `--mode dev`。页面请求实际走同源 `/api`，生产入口需把该路径转发到后端并按当前开发代理行为移除前缀，同时验证 SPA 刷新。不能只上传静态产物就认为前后端已经连通。
6. **数据和存储**：选择并核算持久化 PostgreSQL、Redis、对象存储，制定初始化和备份方式。若改用 R2，需验收分片列表／合并、ETag 条件读取及完整摘要，不仅验证建桶或连通。

以上是待实施项，本次未修改业务代码、接口、认证或部署配置。[后端入口](../../../apps/server/src/main.ts)、[数据库工厂](../../../apps/server/src/database/db.module.ts)、[S3 适配器](../../../apps/server/src/modules/upload/storage/minio-storage.adapter.ts)、[后端依赖](../../../apps/server/package.json)、[前端构建脚本](../../../apps/web/package.json)为相关源码依据。

## 费用核算

价格于 2026-10-27 核验。汇率仅为测算假设：1 美元 = 7.2 元人民币，实际支付以当时汇率和账单为准。

### 免费及基础费的适用范围

- **前端静态托管**：静态资源请求免费且不限量，当前构建文件规模符合 Workers 免费静态资源限制；Worker/API 请求执行按相应计划计费。
- **Workers Paid**：最低 5 美元／月／账户，约 36 元，是使用 Containers 的基础套餐费用，不能代表全栈总价；配额可能与账户其他项目共用。
- **Containers 包含额度**：每月内存 25 GiB-hours、CPU 375 vCPU-minutes、磁盘 200 GB-hours。内存及磁盘按选定实例的配置容量乘运行时间计费，CPU 按实际活动用量计费。
- **R2 Standard**：每月含 10 GB-month 存储、100 万 A 类、1,000 万 B 类请求；超额存储 0.015 美元／GB-month，请求超额另计。直接从 R2 出口免费，其他计量服务仍可产生费用。尚未验证当前项目对 R2 的完整兼容性。
- **PostgreSQL、Redis**：尚未选服务商、地区和容量，无法给出可靠的整套精确总价。任何免费数据库方案都需确认休眠、连接、容量和 Redis／BullMQ 兼容限制。

### 连续运行 30 天的条件测算

假设账户配额未被其他项目占用，只运行一个容器，每月按 720 小时计算。表中仅包含 5 美元基础费、内存及磁盘超额，不包含 CPU 超额、数据库、Redis、Worker／Durable Objects 超额、对象存储／网络／日志超额及税费。

| 实例       | 配置内存／磁盘 | 基础费＋内存＋磁盘（美元／月） | 按假设汇率约合人民币 |
| ---------- | -------------- | ------------------------------ | -------------------- |
| lite       | 256 MiB／2 GB  | 6.70748                        | 48.29 元             |
| basic      | 1 GiB／4 GB    | 11.93036                       | 85.90 元             |
| standard-1 | 4 GiB／8 GB    | 32.09612                       | 231.09 元            |

basic 示例：内存费用为 `(720 × 1 − 25) × 3600 × 0.0000025 = 6.255` 美元；磁盘费用为 `(720 × 4 − 200) × 3600 × 0.00000007 = 0.67536` 美元；加基础费后为 11.93036 美元。[机器可读测算](./测试证据/Cloudflare/30天持续运行费用.json)保留参数和排除项。

lite 仅是价格示例，不是建议购买规格或已验证可用规格。当前 Argon2 单次配置为 64 MiB，再加 Node、框架、连接池及并发开销，本次没有证明 256 MiB 能稳定承载项目。

若仅偶尔演示且实例可休眠、各用量都落在包含额度内，Cloudflare 端可能接近每月 5 美元基础费，再加配套服务。但休眠影响后台 BullMQ 消费，不能以此承诺完整功能一直运行，也不能据此保证整套每月不超过 50 元。

## 与当前部署约束的关系

现行要求包括中国大陆访问、个人演示、每月不超过 50 元、不购买域名且仅用公网 IP。Cloudflare 分配的 `workers.dev` 地址无需购买域名，但仍是域名访问，不满足严格“仅 IP”入口要求；本次也未验证其在用户大陆网络中的访问效果。

因此本次保留 Cloudflare 为补充评估结果，不选定、采购或上线此方案。当前阿里云大陆地域评估方向、用户已排除香港等既有决定继续以[公网部署需求](./需求文档.md)为准，本报告不替换这些选择。

## 未覆盖与后续验收边界

- 未使用 Cloudflare 账号执行云端部署，没有 Wrangler 云端构建、Cloudflare 容器启动、付费账单或公网入口验收结果。
- 未连接云 PostgreSQL／Redis／R2；本地基础连接通过不代表迁移、TLS、上传及持久化验收通过。
- 未在 Cloudflare 规格限制下验证峰值内存、CPU、冷启动、休眠后恢复和大文件处理；未运行队列消费者。
- 未验证中国大陆访问速度及连通性，未验证前端部署后的真实 API 路由和完整业务流程。
- 全栈总价仍依赖数据量、在线时长、CPU、文件请求、服务商及访问量，表中不是封顶价。

## 官方依据

以下为 Cloudflare 官方文档，价格和限制可能调整；本次摘录见[计费依据](./测试证据/Cloudflare/官方计费依据.json)及[运行兼容依据](./测试证据/Cloudflare/官方兼容依据.json)。

- [Containers 计费](https://developers.cloudflare.com/containers/platform/pricing/)：实例规格、基础包含额度、CPU／内存／磁盘与网络计量。
- [Workers 计费](https://developers.cloudflare.com/workers/platform/pricing/)：5 美元账户基础套餐及 Worker 执行计费。
- [静态资源计费](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)与[平台限制](https://developers.cloudflare.com/workers/platform/limits/)：免费静态请求及文件数量／体积限制。
- [R2 计费](https://developers.cloudflare.com/r2/pricing/)：Standard 免费额度、超额存储及操作费用。
- [Containers FAQ](https://developers.cloudflare.com/containers/faq/)：磁盘临时性及休眠行为。
- [Workers Node.js 兼容](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)：`node:worker_threads` 的非功能 stub 状态。
- [workers.dev 入口](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)：平台分配域名的访问方式。

## 变更记录

| 日期       | 摘要                                                                               | 范围与原因                                                                             |
| ---------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2026-10-27 | 完成本地构建、99 项通过／43 项跳过测试、Linux 原生依赖与启动探针及官方条件费用核算 | 确认容器方向可行及待适配边界；不声称已完成云端部署或最小规格验证，不改变当前供应商选择 |
| 2026-10-27 | 建立当前项目 Cloudflare 部署验证和费用评估记录                                     | 用户明确要求验证可部署性及价格；暂未授权购买或云端发布                                 |
