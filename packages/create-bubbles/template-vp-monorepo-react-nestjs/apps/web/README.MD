# 通用平台 Web

基于 React 19、React Router 和 Vite+，作为通用业务平台的前端入口，不限定行业或业务类型。

## 开发

在 Monorepo 根目录执行：

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web test --run
```

开发地址为 `http://localhost:9999`。`/api` 沿用现有代理，转发到 NestJS Server
（开发环境为 `http://localhost:13000`）。工作台提供 ProTable 项目管理演示入口，演示页无需启动后端。

## 组件库与版本

依赖版本统一在根目录 `pnpm-workspace.yaml` 的 `catalog` 管理：

| 依赖 | 接入版本 | 用途 |
| --- | --- | --- |
| `antd` | `^6.6.2` | 基础组件、中英文语言包与主题 |
| `@ant-design/pro-components` | `3.1.14-7`（固定 beta 版本） | ProLayout、PageContainer、ProCard，以及后续的 ProTable / ProForm |
| `@ant-design/icons` | `^6.3.4` | 通用操作图标；平台菜单图标使用 `src/assets/svg/` |
| `@ant-design/cssinjs` | `^2.1.2` | CSS 样式层级配置 |

接入时，ProComponents 的 `latest` 为 2.8.10，其 peerDependencies 仅声明支持 Ant Design 4/5；
`beta` 为 3.1.14-7，声明支持 Ant Design 6 和 React 18+。
因此固定使用兼容的 beta 版本，升级时需重新验证，不要直接安装 `@latest`。
ProComponents 3 的部分 API 已调整，例如 ProCard 使用 `variant="outlined"`，不再使用 `bordered`。

## 全局配置

- `src/App.tsx`：`StyleProvider → ConfigProvider → ProConfigProvider → AntdApp`。
  Ant Design、ProComponents（通过 `IntlType`）、Day.js 和 `<html lang>` 跟随应用当前语言；
  `src/i18n/ui-locale.ts` 集中维护这些适配关系。
- `src/config/theme.ts`：统一配置主题 token，Ant Design 与 ProComponents 共同使用。
- `src/styles/index.css`：声明 `theme → base → antd → antd-pro → components → utilities`
  样式层级、引入基础重置并设置 `html / body / #root` 的全局基础样式，配合 `StyleProvider layer` 使用。
  组件库样式在基础重置之后，业务样式和 Tailwind 工具类在组件库之后。
- 页面和组件的专属样式放在同目录的 `*.module.css`，通过 `styles.xxx` 引用；
  `App.module.css` 管理应用容器，`layouts/BasicLayout/BasicLayout.module.css` 管理布局品牌，
  首页和国际化示例各自使用页面目录中的 `index.module.css`。
  模块样式及其响应式规则统一放在 `@layer components` 中；层名控制覆盖顺序，CSS Modules 负责类名隔离。
- React 19 可直接使用 Ant Design 6，无需 Ant Design 5 的 React 19 兼容补丁。

需要消息提示、通知或确认弹窗时，在 AntdApp 子组件中使用上下文实例：

```tsx
import { useI18n } from '@bubblesjs/i18n-react'
import { App, Button } from 'antd'

export default function MessageExample() {
  const { message } = App.useApp()
  const { tr } = useI18n()
  return <Button onClick={() => void message.success(tr('操作成功'))}>{tr('显示提示')}</Button>
}
```

组件内通过上下文实例继承主题与语言设置；请求配置沿用直接调用 `message.success()` / `message.error()` 的简单写法。

## 国际化规则

- 国际化仅作用于 `apps/web` 前端，统一使用 `@bubblesjs/i18n-core` 和
  `@bubblesjs/i18n-react`。应用只在 `src/main.tsx` 注册一个 `I18nProvider`，页面或功能模块不得创建独立
  store 或嵌套 Provider。
- 支持的语言在 `src/i18n/config.ts` 中统一声明；词条由 `src/i18n/instance.ts` 懒加载，并将用户选择保存到
  localStorage。新增语言时必须同步补充语言配置、词条加载器、`ui-locale.ts` 中的 Ant Design、
  Pro Components `IntlType` 与 Day.js 语言包。
- React 组件内使用 `useI18n()` 获取 `tr`、`locale` 和 `loadLocale`；组件外的路由、请求等逻辑从
  `@/i18n` 导入全局 `tr`。用户可见的标题、按钮、表单标签、校验提示、空状态、通知、错误信息和无障碍文本
  均不得硬编码。
- 词条使用简体中文原文作为 key，例如 `tr('保存')`。动态内容使用占位符和参数
  `tr('你好，{name}', { name })`，不要通过字符串拼接组成可翻译句子。
- 需要在切换语言后更新的静态配置必须在渲染时重新生成，或使用 `() => tr('菜单名称')` 等延迟解析函数；
  长期存活的请求实例，其默认成功和错误提示同样必须使用 `() => tr(...)`，不得在模块初始化时固定翻译结果。
- 中英文词典分别位于 `src/locales/zh_CN.json` 和 `src/locales/en_US.json`。新增或修改文案后，在 Monorepo
  根目录先执行 `pnpm i18n:sync` 同步词条，补全 `en_US.json` 的英文翻译，再执行
  `pnpm i18n:check`，确保不存在缺失、废弃或未使用词条：

```bash
pnpm i18n:sync
pnpm i18n:check
```

## 布局与页面

- `src/layouts/BasicLayout/index.tsx`：ProLayout 基础布局、菜单与 React Router 的 Outlet；配套样式放在同一目录。
- `src/layouts/WorkspaceLayout/index.tsx`：工作区布局；配套样式放在同一目录。
- `/login`：独立登录页，使用 LoginForm / ProFormText，支持账号校验、密码显隐、提交状态与接口错误提示。
- `/home`：工作台，使用 PageContainer 与 ProCard，提供项目管理演示入口。
- `/examples/pro-table`：带菜单的 ProTable 项目管理演示，包含 18 条模拟数据，支持名称或编号搜索、
  状态/负责人/优先级/日期筛选、排序、分页、列设置、新增、编辑、删除和批量删除。
  数据仅保存在页面内存中，刷新或离开页面后恢复初始状态。新增和编辑使用 ModalForm，
  通过组件 ref 的 `show(project?)` / `hide()` 打开和关闭，不请求后端接口。
- `/examples/i18n`：展示应用级语言切换、插值翻译和语言偏好持久化。
- 未匹配的地址显示 404，并可返回工作台。

新增页面时，在 `src/pages` 创建组件，在 `src/router/index.tsx` 注册懒加载子路由，
并在 BasicLayout 的 `menuRoutes` 添加菜单项。页面内使用 PageContainer，复用外层布局。

后续接入 NestJS 接口时，前后端接口类型和返回类型统一从 `shared/types` 导入
（源码为 `packages/shared/src/types`），公用方法从 `shared/utils` 导入
（源码为 `packages/shared/src/utils`）。ProTable 的 `request` 需要返回
`{ data, success, total }`，应在前端适配业务 API 的统一响应。

## 浏览器存储

- `src/utils/storage/cookie.ts`：`cookie.get / set / remove`，用于 Cookie 的读取、写入、更新和删除。
  默认 `Path=/`、`SameSite=Lax`，HTTPS 下自动设置 `Secure`；支持过期时间、有效秒数和域名。
  删除自定义作用域的 Cookie 时，传入与写入时相同的 `path`、`domain`。
- `src/utils/storage/session.ts`：`local` 对应 localStorage，`session` 对应 sessionStorage，
  均提供 `get / set / remove / clear`。值自动转换为 JSON；不存在或 JSON 无效时读取返回 `null`。
  `set` 同时用于新增和更新，浏览器存储失败时将错误交给调用方处理。

```ts
import { cookie } from '@/utils/storage/cookie'
import { local, session } from '@/utils/storage/session'

cookie.set('preference', 'compact')
cookie.get('preference')
cookie.remove('preference')

local.set('settings', { theme: 'light' })
local.get<{ theme: string }>('settings')
session.set('draft', { title: '草稿' })
session.remove('draft')
```

## 登录与会话

`src/pages/login/api.ts` 定义登录请求，`src/api/auth.ts` 定义布局使用的退出请求，
分别复用共享包中的 LoginRequest、LoginResult 和 LogoutResult：

| 接口 | 用途 |
| --- | --- |
| `POST /auth/login` | 使用 `account`、`password` 登录，返回不透明 Session Token |
| `POST /auth/logout` | 撤销当前 Session |

浏览器通过 `/api` 代理访问以上接口。Server 成功时直接返回业务数据，失败时返回 HTTP 错误状态和
`{ code, message, details? }`，因此 Web 请求默认 `isWrapped: false`。后续接其他包装格式的接口时，
可以在 method 的 `meta` 中覆盖 `isWrapped`。请求 core 默认使用 Axios，所有 2xx 响应进入
`responded.onSuccess`，仅解析数据及检查包装响应的业务 `code`；不再配置 `statusMap.success`。
非 2xx 错误进入 `responded.onError`，使用原生 `Error` 承载错误消息，并附加 `status` 和 `code`，
并通过 `statusMap.unAuthorized` 处理 HTTP 401。业务检查抛出的错误直接传给调用方，不会再次进入
全局 `onError`。自定义适配器须遵守相同的 HTTP 错误拒绝约定，并在 `error.response` 中保留响应。
页面自己展示错误时设置 `isShowErrorMessage: false`，避免重复提示。

- 登录令牌通过 `cookie` 工具保存在 `token` Cookie 中，过期时间使用接口返回的
  `absoluteExpiresAt`；请求从 Cookie 读取令牌并携带 `Authorization: Bearer <token>`。
  登录、退出和 401 清理统一使用 Cookie，不在 localStorage 或 sessionStorage 中保存令牌。
- 登录成功后跳转 `/home`；路由直接渲染页面，不进行前置会话校验或登录回跳。
- 顶部根据令牌是否存在显示登录或退出入口；退出时先请求 Server 撤销会话，成功后清除令牌并跳转登录页。
- 登录和退出请求关闭缓存与请求共享。
- 请求成功和失败提示由 `successMessageFunc`、`errorMessageFunc` 展示，默认文案通过延迟翻译函数解析；
  `unAuthorizedResponseFunc` 清除令牌、提示并跳转登录页。
- 请求配置不设置客户端超时，统一由 Nginx 控制。

当前 Server 使用 PostgreSQL 保存用户及 Argon2 密码哈希，Redis 保存 Session 并处理过期与撤销，
不是 JWT。接口访问控制由 NestJS 的 SessionAuthGuard 完成。
令牌在浏览器内可由 JavaScript 读取，部署时需使用 HTTPS 并防范 XSS；如改为 HttpOnly Cookie，
必须同时调整 Server 的认证协议与 CSRF 防护。

真实联调需要先启动 Docker Desktop，再在仓库根目录启动 PostgreSQL、Redis 和 Server：

```bash
docker compose up -d postgres redis
pnpm --filter server dev
pnpm --filter web dev
```

后两条命令各在一个终端运行。数据库需要具备现有迁移定义的表。当前没有内置默认账号，
可使用已有账号，或通过 Server Swagger 的 `POST /auth/register` 创建开发账号。
开发接口文档为 `http://localhost:13000/api-docs`。

`test/storage.spec.ts` 验证 Cookie 编解码、作用域与过期属性，以及 local/session 的数据读写与隔离。
`test/request.spec.ts` 使用临时 HTTP 服务验证 Axios 响应适配、Bearer 请求头、2xx 成功、
401 / 422 / 503 错误及 HTTP 200 下的业务失败，
这些测试不依赖 PostgreSQL 或 Redis，也不代替真实数据库认证联调。
