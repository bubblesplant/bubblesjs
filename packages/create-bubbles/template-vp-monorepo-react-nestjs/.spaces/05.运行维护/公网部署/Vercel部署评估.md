# Vercel 部署评估

状态：验证记录；官方支持与计费资料核查、当前项目源码对照已完成，尚未执行 Vercel 构建或云端部署。

核验日期：2026-10-27。范围及既有约束以[公网部署需求](./需求文档.md)为准。本次复用[Cloudflare 评估中的本地验证](./Cloudflare部署评估.md)，不重复安装依赖或执行与本次变化无关的测试。

## 验证目标

- 核对 React 静态部署、NestJS／Fastify 官方支持及当前后端依赖在 Functions 中的边界。
- 核对个人非商业演示免费条件、Pro 基础费，以及数据库、Redis 和对象存储的额外费用。
- 明确持续后台消费者、上传请求和云端适配未验收范围；不创建云资源或改变既有部署约束。

## 验证记录

Vercel 可以作为当前 React 前端与 NestJS HTTP API 的部署方向。官方已提供 NestJS 和 Fastify 的自动识别支持；NestJS 应用部署后成为一个使用 Fluid compute 的 Vercel Function。项目现有 `apps/server/src/main.ts` 符合官方入口文件命名，不需要仅因为使用 NestJS 而改写成其他框架。

当前完整项目仍不能视为已支持原样一键部署。已发现确定的上传请求限制冲突，并需要配置工作区依赖、生产环境变量、数据库及 Redis 连接，以及持续后台消费者的独立运行方式。

### 项目兼容性

| 组件                           | 评估结果                                   | 当前项目的适配项及边界                                                                                                                 |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| React／Vite+ 静态 SPA          | 可采用 Vercel 静态托管                     | 上轮 React 构建通过；配置 monorepo 构建、SPA 回退和同源 `/api` 路由。当前 `--mode dev` 构建脚本需核对                                  |
| NestJS 12／Fastify HTTP API    | 官方支持两个框架，当前入口名称符合规则     | 仍需验证组合适配、NestJS 12、Rspack、别名、装饰器和工作区打包；官方框架支持不是本项目云端部署通过证据                                  |
| 原生 Argon2 和 SHA-256 线程    | 使用 Node.js runtime，有完整 Node API 支持 | 不套用 Cloudflare Workers 的线程 stub 限制。仍需验证 Linux 原生二进制、线程产物路径和打包文件包含；已有本地 Linux 结果仅供参考         |
| PostgreSQL、Redis、S3 兼容存储 | 使用独立持久化服务                         | 尚未选云服务和用量；Functions／Daemons 不是已有 Compose 中三类服务的持久化托管替代。托管服务的 TLS 和连接池需要适配                    |
| BullMQ 常驻消费者              | 可评估 Vercel Daemons，当前为 Public Beta  | 官方明确支持 Redis／BullMQ 消费者，Hobby 也可用；需要容器配置、消费者入口和停止时处理。不能依赖普通 HTTP Function 返回后的进程一直消费 |
| 分片上传                       | 当前协议与 Functions 限制冲突              | 每个常规分片是 10 MiB，超过官方 4.5 MB 请求体上限。需评估客户端直传 S3 兼容存储或将上传 API 部署到其他后端；本次不改变协议             |

上传依据：[分片常量](../../../apps/server/src/modules/upload/upload.constants.ts)定义 `10 * 1024 * 1024` 字节；[上传控制器](../../../apps/server/src/modules/upload/upload.controller.ts)将分片流交给[上传服务](../../../apps/server/src/modules/upload/upload.service.ts)后转发对象存储。后端流式读取并不能消除平台在请求入口施加的上限，因此不能仅因使用流就认为 10 MiB 分片可用。

官方现有 Container Runtime 也可以从镜像运行 HTTP 服务，当前为 Beta，适合定制运行环境；但它仍使用 Functions 的相同限制，不能以改成 Docker 部署绕过上传体积或调用时长限制。本次未封装或部署镜像。

### 后台任务与时长

- 普通 Functions 的 Fluid compute：Hobby 每次调用默认及最大为 300 秒；Pro 默认 300 秒、通常可配置至 800 秒，部分受支持配置有 1,800 秒扩展 Beta。这些均不是无限期后台进程保证。
- Daemons：官方维持配置的实例数量，适合持续轮询队列。Hobby 当前每个团队每月包含 **5 Active CPU-hours** 的 Daemon 配额，空闲等待不计入 Active CPU；额度耗尽会停止团队 Daemons，直至下月或升级。该额度与普通 Functions 的 4 CPU-hours 不应混为同一指标。
- Daemons 当前不接收入站 HTTP／TCP，也没有持久本地存储，且只运行生产环境。因此 API 和消费者应分别设计；不能把整个 HTTP 服务作为 Daemon 暴露给网页。
- Daemons 的 Beta 目前要求 Vercel 项目根目录为仓库根，不能设为 `apps/web` 等子目录。该仓库的 Git 根还包含其他模板，需要专门核对 monorepo 根、构建上下文和依赖范围。

### 已有验证与本轮边界

复用上轮[本地验证记录](./Cloudflare部署评估.md)：React／NestJS 构建通过、后端 99 项测试通过／43 项外部集成跳过、本地 Linux Argon2／实际摘要线程／基础设施连接／HTTP 启动通过。没有因本轮只修改评估文档而重复运行这些测试，也不将这些旧证据标为 Vercel 验收结果。

本轮通过 CodeGraph 对照当前分片大小、上传 API、Fastify 适配器和入口，并直接读取 Vercel 官方 Markdown 文档。没有运行 `vercel build`／`vercel dev`、没有连接 Vercel 账号、没有云端打包或公网请求、真实账单、大陆访问和浏览器业务验收。尚未检查 Vercel 构建的函数包是否完整携带原生模块及 `sha256.worker.cjs`。

## 价格与预算

官方价格核验日期：2026-10-27。人民币仅以 1 美元 = 7.2 元测算，不代表实时汇率；税费和实际支付汇率另计。

| 方案          | 官方平台费用                  | 适用条件与未包含成本                                                                                                                |
| ------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Hobby         | 0 美元／月                    | 仅限个人、非商业用途且在额度内。静态前端及 HTTP API 可使用免费资源；数据库、Redis、对象存储等需另选服务，不能保证全栈免费           |
| Hobby Daemons | 当前不收费，采用配额限制      | Public Beta，团队每月 5 Active CPU-hours；达到额度后停止消费者，不保证业务队列全年持续可用                                          |
| Pro           | 平台费 20 美元／月，约 144 元 | 含 1 个部署成员席位和每月 20 美元平台用量抵扣额；抵扣用尽后按量计费，额外部署席位每人每月 20 美元。不是 20 美元覆盖所有服务或不限量 |

Hobby 普通 Functions 月度包含 Active CPU 4 小时、Provisioned Memory 360 GB-hours、100 万次调用等；静态流量和 CDN 请求也有额度。超限可能暂停相应能力，不按无限免费估算。Pro 的 Daemons 按 Active CPU 和 Provisioned Memory 计费；实际总费用取决于地域、实例数、配置内存、运行时长及任务量，本次不编造整体固定价格。

以每月 50 元总预算看，**个人非商业轻量演示可进一步评估 Hobby**，但前提是完成上传适配、消费者部署和配套服务选型，并验证免费额度及功能符合演示要求。若需要 Pro，平台基础费已超过该预算；目前没有证明完整项目可以在 50 元内运行。

Vercel 自动提供 `.vercel.app` 地址，无需购买域名，但仍是域名访问，不等于满足既有严格“仅公网 IP”要求。中国大陆实际访问效果未验证，本轮不替用户放宽访问入口约束。

## 待实施工作

1. 选择 React 静态站点和 NestJS 的 monorepo／Services 项目结构，配置生产构建、同源 API 和 SPA 回退。
2. 解决 10 MiB 分片与 4.5 MB 上限冲突。直传对象存储将涉及现有上传契约，需在相应上传需求和契约中设计后实施，本轮仅识别阻碍。
3. 若保留后台队列，配置 Daemons 或独立消费者宿主、镜像、停止与重试策略；API 实例关闭本地消费者，避免实例扩缩容无意增加消费进程。
4. 补齐运行时依赖和生产密钥，选择 PostgreSQL／Redis／S3 服务并核实 TLS、连接池、容量及免费限制。现有生产配置缺项和依赖归属问题见[Cloudflare 评估](./Cloudflare部署评估.md)。
5. 完成 Vercel 构建与部署后，实际验证原生模块、摘要线程、登录权限、分片上传、队列恢复、冷启动和用户大陆网络访问，之后才能宣布项目部署通过或给出可信月费。

本次不修改业务代码、不改变上传协议、不创建云资源，保留现行预算及未选定供应商状态。

## 官方依据

本次关键摘录及核验日期见[官方依据 JSON](./测试证据/Vercel/官方依据.json)。

- [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs)及[Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify)：框架自动检测、入口名称和 Functions 运行方式。
- [Functions 限制](https://vercel.com/docs/functions/limitations)：4.5 MB 请求体上限、时长及包体限制；[Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)：完整 Node API。
- [Daemons](https://vercel.com/docs/daemons)及[Daemons 限制和计费](https://vercel.com/docs/daemons/limits)：BullMQ、Hobby 配额、生产运行和持久化边界。
- [Container Runtime](https://vercel.com/docs/functions/runtimes/container)：镜像部署仍适用 Functions 限制。
- [Hobby](https://vercel.com/docs/plans/hobby)、[Pro](https://vercel.com/docs/plans/pro-plan)：个人非商业免费条件、20 美元平台费、用量抵扣和额外计费。
- [平台域名](https://vercel.com/docs/domains/working-with-domains)：自动分配 `.vercel.app` 地址。

## 变更记录

| 日期       | 摘要                                                                   | 范围与原因                                                                 |
| ---------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 2026-10-27 | 完成官方支持、免费和 Pro 条件、Daemons Beta 及当前 10 MiB 上传冲突核验 | 明确平台可承载前后端，但现有完整项目仍需适配；未执行 Vercel 构建或云端部署 |
| 2026-10-27 | 增加 Vercel 兼容性及计费核验                                           | 用户要求继续比较该平台；尚未云端部署                                       |
