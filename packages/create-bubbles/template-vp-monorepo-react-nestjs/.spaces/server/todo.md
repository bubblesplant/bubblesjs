# TODO: 生产发布——把 NestJS 加入 docker-compose

> 状态：**未开始**（本文是规划 + 教程，按顺序执行即可）
>
> 适用目录：`packages/create-bubbles/template-vp-monorepo-react-nestjs`
>
> 前置阅读：`.spaces/server/upload.md`（分片上传，其注释里"等 NestJS 容器化后改用 `http://minio:9000`"就是本文要兑现的事）

## 0. 结论先行

开发与生产的分工不变：**开发时 NestJS 留在宿主机跑（热更新），生产时才容器化**。用 Compose `profiles` 区分，日常 `docker compose up -d` 不会碰 server，加 `--profile prod` 才会构建并启动它。

```text
开发（现在）                          生产（本文目标）
─────────────────                    ─────────────────
宿主机 pnpm dev ──localhost──> MinIO   server 容器 ──minio:9000──> MinIO 容器
                                     server 容器 ──postgres──> Postgres 容器
                                     server 容器 ──redis──> Redis 容器
```

为什么生产要放进 Compose：

| 理由 | 说明 |
| ---- | ---- |
| 交付物统一 | 镜像锁定 Node 版本 + 依赖版本，"我机器上能跑"问题消失 |
| 内网通信 | NestJS 连 MinIO/PG/Redis 走 Compose 内部网络，不占宿主机端口 |
| 自愈 | `restart: unless-stopped`，进程崩溃自动拉起 |
| 同事零配置 | 一条 `docker compose --profile prod up -d` 起全套 |

## 1. 动工前必须修复的三个问题

### 1.1 docker-compose.yml 有拼写错误（现有 Bug）

第 43 行 `minio-init` 服务里写的是 `enviroment`，少了 `n`。环境变量不会被注入，`$MINIO_ROOT_USER` 为空，`until mc alias set ...` 会**永远循环重试**，bucket 永远建不出来。改成：

```yaml
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123456
      MINIO_BUCKET: uploads
```

### 1.2 把 `shared` 和 `@nestjs/swagger` 移到 dependencies

`apps/server/package.json` 里这两个包在 **devDependencies**，但它们是**运行时依赖**，证据：

- 编译产物 `dist/src/**/*.js` 中存在真实调用：`require("shared/utils")`（`src/common/constants/*` 对 `shared/utils` 是值再导出，不是纯类型导入）。
- `src/main.ts` 运行时调用 `SwaggerModule.setup()`，需要 `@nestjs/swagger`。

为什么现在能跑：开发模式不裁剪依赖。为什么生产会崩：本文用 `pnpm deploy --prod` 产出生产依赖目录，**devDependencies 会被整体丢弃**，容器一启动就 `Cannot find module 'shared/utils'`。

改法：在 `apps/server/package.json` 中把这两行从 `devDependencies` 移到 `dependencies`（版本写法 `catalog:` 保持不变）：

```jsonc
"dependencies": {
  // ...原有依赖不动
  "@nestjs/swagger": "catalog:",
  "shared": "workspace:*"
},
"devDependencies": {
  // 删掉这两行
}
```

### 1.3 固定 MinIO 镜像版本

当前 `minio/minio:latest` 实际是 `RELEASE.2025-09-07T16-13-09Z`。把 `minio` 与 `minio-init` 的镜像都固定到该版本（mc 选同期发布版本），避免某天 `pull` 拉到不兼容的新版本。

## 2. 第一步：写 `.dockerignore`（仓库根目录）

新建 `d:\...\template-vp-monorepo-react-nestjs\.dockerignore`：

```text
# 依赖与构建产物：容器内会重新安装、重新构建
node_modules
**/node_modules
**/dist
.pnpm-store

# 环境变量文件：绝不能进入镜像（生产配置走 Compose environment）
**/.env
**/.env.*
!**/.env.example

# 版本控制与本目录
.git
.spaces
```

三个作用：

1. **缩小构建上下文**：`docker build` 会先把整个目录发给 Docker daemon，排除 node_modules 后从 GB 级降到 MB 级。
2. **防止跨平台污染**：宿主机是 Windows，`node_modules` 里 argon2 等原生模块是 win32 二进制，混进 Linux 镜像必然崩溃。
3. **防止密钥泄漏**：`.env`、`.env.development.local` 一旦 COPY 进镜像，会随镜像分发给所有拿到镜像的人。

## 3. 第二步：写 Dockerfile（`apps/server/Dockerfile`）

### 3.1 三个关键认知

**为什么 build context 必须是仓库根目录，而不是 `apps/server`？**

- `apps/server/package.json` 的版本全是 `catalog:`，真实版本表在根目录的 `pnpm-workspace.yaml`；
- server 运行时依赖 `packages/shared`（workspace 包），构建时还要先编译它；
- `apps/server/tsconfig.json` 继承根目录的 `../../tsconfig.base.json`。

**为什么基镜像是 `node:22-bookworm-slim` 而不是 alpine？**

- `argon2` 是原生模块，官方预编译产物按 C 库区分：bookworm（Debian/glibc）开箱即用；alpine 是 musl，可能触发源码编译，需要额外装编译链；
- `shared` 是 ESM（`"type": "module"`），server 编译产物是 CJS，`require()` 一个 ESM 文件需要 Node 22.12+。devEngines 要求 `>=22.18.0`，所以**镜像绝不能降到 node:20**。

**为什么先 COPY 一堆 package.json 再 install？**

Docker 按层缓存。只拷清单时，"装依赖"这一层仅在**依赖变化**时才重新执行；改一行业务代码不会触发重装全部依赖。另外 `--frozen-lockfile` 会校验**整个 workspace**，所以 web、web-vue、i18n 子包的 `package.json` 也必须存在，即使 server 镜像根本用不到它们。

### 3.2 完整 Dockerfile

新建 `apps/server/Dockerfile`：

```dockerfile
# syntax=docker/dockerfile:1

########## 阶段 1：构建 ##########
FROM node:22-bookworm-slim AS build

# pnpm 版本与 devEngines 声明保持一致
RUN npm install -g pnpm@11.9.0

WORKDIR /repo

# 只拷依赖清单，让 install 层可以被缓存
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/web-vue/package.json apps/web-vue/
COPY packages/shared/package.json packages/shared/
COPY packages/i18n/cli/package.json packages/i18n/cli/
COPY packages/i18n/core/package.json packages/i18n/core/
COPY packages/i18n/react/package.json packages/i18n/react/
COPY packages/i18n/vue/package.json packages/i18n/vue/

RUN pnpm install --frozen-lockfile

# 拷源码并构建：shared 必须先于 server
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter shared build
RUN pnpm --filter server build

# 产出自包含部署目录 /out：package.json + node_modules(仅生产依赖) + dist
# --legacy 表示沿用"注入真实文件"的部署方式，无需改 workspace 配置
RUN pnpm --filter server deploy --legacy --prod /out

########## 阶段 2：运行 ##########
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./

EXPOSE 13000
CMD ["node", "dist/src/main.js"]
```

注意两处容易写错的地方：

- 入口是 `dist/src/main.js`，**不是** `dist/main.js`。SWC 构建的产物在 `dist/src/` 下，可用 `Get-ChildItem apps/server/dist -Recurse -Filter main.js` 验证。
- `pnpm deploy` 在 pnpm 10+ 默认要求 workspace 开启 `inject-workspace-packages`，加 `--legacy` 走传统自包含部署，不改动现有 workspace 配置。

### 3.3 验证构建

在模板根目录执行：

```powershell
docker compose --profile prod build server
```

预期：两个阶段依次完成，无 `Cannot find module`、无 argon2 编译报错。首次构建 3～8 分钟（装依赖为主），之后改代码重新构建只重跑"拷源码之后"的层。

## 4. 第三步：改造 docker-compose.yml

### 4.1 给基础设施加 healthcheck

`depends_on` 默认只保证"容器启动"，不保证"服务就绪"。server 启动时若 PG 还在初始化，会直接连接失败。给三个基础服务补上健康检查：

```yaml
  postgres:
    # ...原有配置不动，追加：
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d postgres']
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    # ...原有配置不动，追加（密码改为从环境变量读取，和 postgres 风格一致）：
    environment:
      REDIS_PASSWORD: ml
    command: sh -c "redis-server --appendonly yes --requirepass $$REDIS_PASSWORD"
    healthcheck:
      test: ['CMD-SHELL', 'redis-cli -a "$$REDIS_PASSWORD" --no-auth-warning ping | grep PONG']
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    # ...原有配置不动，追加：
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 5s
      timeout: 3s
      retries: 10

  minio-init:
    # depends_on 从 service_started 升级为 service_healthy，等 MinIO 真正可用
    depends_on:
      minio:
        condition: service_healthy
```

`$$` 是 Compose 的转义，表示"这个 `$` 原样传给容器内 shell"。

### 4.2 新增 server 服务

`depends_on` 三种条件的含义：

| 条件 | 含义 |
| ---- | ---- |
| `service_started` | 容器进程拉起（不代表能连） |
| `service_healthy` | healthcheck 通过才继续 |
| `service_completed_successfully` | 等一次性任务成功退出（minio-init 建完 bucket） |

在文件末尾 `volumes:` 之前追加：

```yaml
  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    image: vp-server:local
    container_name: vp-server
    restart: unless-stopped
    # 开发模式不启动本服务：docker compose up -d 不会构建它
    # 生产全量启动：docker compose --profile prod up -d --build
    profiles: ['prod']
    ports:
      - '13000:13000'
    environment:
      NODE_ENV: production
      PORT: 13000
      HOST: 0.0.0.0

      # Postgres：宿主机 localhost → 服务名 postgres
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: postgres
      DB_USERNAME: postgres
      DB_PASSWORD: ${DB_PASSWORD:-ml}
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD:-ml}@postgres:5432/postgres

      # Redis
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD:-ml}
      REDIS_DB: 0

      # MinIO：本文的核心收益，容器内走内部网络
      STORAGE_ENDPOINT: http://minio:9000
      STORAGE_REGION: us-east-1
      STORAGE_ACCESS_KEY_ID: ${MINIO_ROOT_USER:-minio}
      STORAGE_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD:-minio123456}
      STORAGE_BUCKET: uploads

      # 密钥类：必须由根目录 .env 提供，禁止写死在 yml 里
      JWT_SECRET: ${JWT_SECRET:?请在仓库根目录 .env 中提供 JWT_SECRET}
      SESSION_TOKEN_PEPPER: ${SESSION_TOKEN_PEPPER:?请在仓库根目录 .env 中提供 SESSION_TOKEN_PEPPER}
      SESSION_IDLE_TTL_SECONDS: '7200'
      SESSION_ABSOLUTE_TTL_SECONDS: '604800'

      # LLM
      LLM_API_URL: ${LLM_API_URL:-}
      LLM_API_MODEL: ${LLM_API_MODEL:-}
      LLM_API_KEY: ${LLM_API_KEY:-}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
      minio-init:
        condition: service_completed_successfully
```

环境变量切换对照（这就是 `upload.md` 里那条注释的兑现）：

| 变量 | 开发（宿主机跑 NestJS） | 生产（本服务） |
| ---- | ---- | ---- |
| `STORAGE_ENDPOINT` | `http://127.0.0.1:9000` | `http://minio:9000` |
| `DB_HOST` / `DATABASE_URL` | `localhost` | `postgres` |
| `REDIS_HOST` | `localhost` | `redis` |

### 4.3 敏感信息放根目录 `.env`

Compose 会自动读取**与 yml 同目录**的 `.env` 做变量插值（注意：不是 `apps/server/.env`）。新建仓库根目录 `.env`：

```dotenv
DB_PASSWORD=ml
REDIS_PASSWORD=ml
MINIO_ROOT_USER=minio
MINIO_ROOT_PASSWORD=minio123456
JWT_SECRET=换成生产强度的随机串
SESSION_TOKEN_PEPPER=换成生产强度的随机串
LLM_API_URL=https://api-inference.modelscope.cn/v1
LLM_API_MODEL=deepseek-ai/DeepSeek-V3.2
LLM_API_KEY=你的key
```

生产部署时把 `ml`、`minio123456` 这类开发默认值全部换成强密码，并确认根目录 `.gitignore` 包含 `.env`，防止密钥入库。`${VAR:?提示}` 写法表示"未提供就报错拒绝启动"，用于不可缺省的密钥；`${VAR:-默认值}` 表示"缺省时用默认值"。

## 5. 第四步：启动与验证

```powershell
# 1. 语法检查
docker compose config

# 2. 构建并启动（首次）
docker compose --profile prod up -d --build

# 3. 查看状态，预期 4 个服务 healthy/running + minio-init exited(0)
docker compose ps
docker compose logs -f server
```

验证清单：

- [ ] `docker compose ps` 中 postgres/redis/minio 显示 `healthy`，minio-init 显示 `exited (0)`，server 显示 `running`
- [ ] `curl.exe http://localhost:13000/api-docs-json` 返回 OpenAPI JSON
- [ ] 按 `upload.md` 的接口走一次完整分片上传，文件出现在 `uploads` bucket（9001 控制台确认）
- [ ] 容器重启自愈：`docker restart vp-server` 后自动恢复
- [ ] 开发模式不受影响：`docker compose up -d`（无 profile）仍只起基础设施，宿主机 `pnpm --filter server dev` 照常工作

数据库迁移提醒：server 容器**不会自动建表**。全新环境首次启动前，在宿主机执行一次 `pnpm --filter server db:push`（通过 localhost:5432 端口映射连 PG），或者临时 `docker exec -it vp-server node ...` 手动迁移。

## 6. 常见坑（按踩中概率排序）

1. **容器里连不上基础设施**：容器内 `localhost` 指容器自己。一律用服务名 `postgres` / `redis` / `minio`。
2. **端口冲突**：宿主机 `pnpm dev`（13000）与 compose 映射的 13000 同时跑会冲突。二选一。
3. **把宿主机 node_modules 拷进镜像**：win32 的 argon2 二进制进 Linux 容器必崩。靠 `.dockerignore` 兜底。
4. **镜像降到 node:20**：`require()` ESM 的 `shared` 会报 `ERR_REQUIRE_ESM`。保持 node:22。
5. **install 阶段 `prepare: vp config` 失败**（如需要 TTY）：临时加 `--ignore-scripts`。argon2 有预编译产物，跳过脚本不影响运行。
6. **改了代码没生效**：镜像是构建时固化的，改代码必须 `--profile prod up -d --build`，不是重启容器。
7. **minio-init 死循环**：第 1.1 节的 `enviroment` 拼写错误没修。

## 7. 可选优化（先跑通，再做）

| 优化 | 做法 | 收益 |
| ---- | ---- | ---- |
| 更小的镜像 | 基础镜像换 `node:22-slim` 的 digest 固定版本 | 可复现构建 |
| 缓存加速 | `RUN --mount=type=cache` 挂 pnpm store | 重装依赖秒级 |
| server 健康检查 | 先在代码里加 `/health` 路由，再给 server 服务配 healthcheck | 编排可靠性 |
| 前端容器化 | `apps/web` 构建成静态文件 + nginx 托管并反代 `/api` 到 server | 全栈一条命令（另开 TODO） |
| 替代部署方式 | 开启 `inject-workspace-packages` 后用默认 `pnpm deploy` | 与官方推荐一致 |

## 8. 任务清单

- [ ] 修复 `docker-compose.yml` 第 43 行 `enviroment` 拼写错误
- [ ] `apps/server/package.json`：`shared`、`@nestjs/swagger` 移入 dependencies
- [ ] 固定 minio / minio-init 镜像版本
- [ ] 新建仓库根目录 `.dockerignore`
- [ ] 新建 `apps/server/Dockerfile`
- [ ] compose 追加 postgres / redis / minio 的 healthcheck
- [ ] compose 追加 server 服务（profiles: prod）
- [ ] 新建仓库根目录 `.env` 并确认 .gitignore 覆盖
- [ ] `docker compose --profile prod up -d --build` 走通第 5 节验证清单
