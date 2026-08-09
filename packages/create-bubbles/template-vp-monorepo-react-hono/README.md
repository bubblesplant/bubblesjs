# Vite+ React + Hono Monorepo

这个模板包含 React 前端、Hono API、Drizzle/PostgreSQL、Redis 与独立 BullMQ Worker。

## 项目结构

- `apps/web`: React 前端，开发端口 `9999`
- `apps/server`: Hono API 与 BullMQ Worker，API 开发端口 `10000`
- `packages/i18n`: 可复用的国际化包
- `docker-compose.yml`: PostgreSQL、Redis 与 MinIO 本地基础设施

## 首次启动

```powershell
vp install
Copy-Item apps/server/.env.example apps/server/.env
docker compose up -d postgres redis
vp run --filter server db:migrate
```

分别启动应用与队列 Worker：

```powershell
# 终端 1：React + Hono API
vp run dev

# 终端 2：BullMQ Worker
vp run dev:worker
```

也可以通过 Vite+ 选择后端运行时：

```powershell
# Node API / Worker
vp run dev:server:node
vp run dev:worker:node

# Bun API / Worker
vp run dev:server:bun
vp run dev:worker:bun
```

前端的 `/api/*` 代理会移除 `/api` 前缀，因此：

- 浏览器请求 `/api/health/live`，后端路由为 `/health/live`
- 浏览器请求 `/api/v1/jobs/demo`，后端路由为 `/v1/jobs/demo`

后端也同时挂载 `/api/health/*` 与 `/api/v1/jobs/*`，因此生产环境即使不配置 rewrite 也可直接使用前端的 `/api` 地址。

## 验证

```powershell
vp run ready
```
