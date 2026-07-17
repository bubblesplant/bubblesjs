# template-vp-vue-eslint

Vue 3 项目模板，基于 Vite+ 统一工具链，集成 Antdv Next UI 组件库、UnoCSS 原子化样式、ESLint 代码规范。

## 技术栈

| 分类 | 技术 | 说明 |
|------|------|------|
| 构建工具 | Vite+ (`vp`) | 统一工具链，封装 Vite + Rolldown + Oxlint |
| 框架 | Vue 3 | Composition API + `<script setup>` |
| 语言 | TypeScript 6/7 并存 | TS7 编译 + TS6 支持 typescript-eslint/vue-tsc |
| UI 组件库 | Antdv Next | 自动按需导入 |
| 状态管理 | Pinia | 含持久化插件 |
| 路由 | Vue Router 5 | |
| 请求库 | Alova | 基于 Axios 适配器，双调用实例 |
| 样式方案 | UnoCSS | Wind4 + Attributify 预设 |
| 代码规范 | ESLint (@antfu/eslint-config) + OxLint | |
| Git 钩子 | Lefthook + Commitlint | |

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产包
pnpm build

# 代码检查
pnpm lint

# 代码修复
pnpm lint:fix
```

## 目录结构

```
src/
├── api/                # API 接口定义
├── assets/             # 静态资源
│   ├── icon/           # SVG 图标
│   └── image/          # 图片资源
├── components/         # 公共组件
│   └── Icon/           # SVG 图标组件
├── hooks/              # 组合式函数
├── layout/             # 布局组件
│   └── default/        # 默认布局（侧边栏 + 顶部栏）
├── router/             # 路由配置
│   ├── guard/          # 路由守卫
│   └── modules/        # 路由模块
├── store/              # Pinia 状态管理
│   └── modules/        # 业务 Store
├── styles/             # 全局样式
├── types/              # 类型声明（自动生成）
├── utils/              # 工具函数
│   └── request/        # Alova 请求封装
├── views/              # 页面视图
├── App.vue             # 根组件
└── main.ts             # 应用入口
```

## 环境变量

| 文件 | 用途 |
|------|------|
| `.env` | 公共环境变量 |
| `.env.development` | 开发环境 |
| `.env.production` | 生产环境 |

关键变量：

| 变量名 | 说明 |
|--------|------|
| `VITE_PORT` | 开发服务器端口 |
| `VITE_API_URL` | 后端 API 地址 |
| `VITE_API_AFFIX` | API 路由前缀（用于代理） |
| `VITE_APP_NAME` | 应用名称 |

## TypeScript 6/7 并存说明

TypeScript 7.0 使用 Go 重写了编译器，但暂不提供程序化 API，因此 `typescript-eslint` 和 `vue-tsc` 暂不兼容。

本项目采用微软官方推荐的并存方案：

- `typescript` → 指向 `@typescript/typescript6`（供 ESLint、vue-tsc 使用）
- `@typescript/native` → 指向 TypeScript 7（可手动调用 `npx @typescript/native tsc`）

VS Code 中安装 [TypeScript (Native Preview)](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview) 扩展可享受 TS7 的语言服务加速。

## 代码规范

- **ESLint**：使用 `@antfu/eslint-config`，单引号、无分号、自动排序 imports
- **OxLint**：作为 ESLint 的补充，提供更快的 lint 速度
- **Commitlint**：提交信息需遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
