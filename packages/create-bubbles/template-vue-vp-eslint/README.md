# template-vp-vue-eslint-vapor

Vue 3 Vapor 项目模板，基于 Vite+ 统一工具链，集成 Antdv Next UI 组件库、UnoCSS 原子化样式和 ESLint 代码规范。

## 技术栈

| 分类      | 技术                                   | 说明                                            |
| --------- | -------------------------------------- | ----------------------------------------------- |
| 构建工具  | Vite+ (`vp`)                           | 统一工具链，封装 Vite + Rolldown + Oxlint       |
| 框架      | Vue 3.6 RC                             | Composition API + `<script setup>` + Vapor 模式 |
| 语言      | TypeScript 6                           | 配合 vue-tsc 进行类型检查                       |
| UI 组件库 | Antdv Next                             | 自动按需导入                                    |
| 状态管理  | Pinia                                  | 含持久化插件                                    |
| 路由      | Vue Router 5                           |                                                 |
| 请求库    | Alova                                  | 基于 Axios 适配器，双调用实例                   |
| 样式方案  | UnoCSS                                 | Wind4 + Attributify 预设                        |
| 代码规范  | ESLint (@antfu/eslint-config) + OxLint |                                                 |
| Git 钩子  | Vite+ hooks + Commitlint               |                                                 |

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

| 文件               | 用途         |
| ------------------ | ------------ |
| `.env`             | 公共环境变量 |
| `.env.development` | 开发环境     |
| `.env.production`  | 生产环境     |

关键变量：

| 变量名           | 说明                     |
| ---------------- | ------------------------ |
| `VITE_PORT`      | 开发服务器端口           |
| `VITE_API_URL`   | 后端 API 地址            |
| `VITE_API_AFFIX` | API 路由前缀（用于代理） |
| `VITE_APP_NAME`  | 应用名称                 |

## Vapor 模式

模板在 `vite.config.ts` 中通过 `@vitejs/plugin-vue` 开启 `features.vapor`，用于体验 Vue 3.6 的 Vapor 编译模式。

当前使用 Vue RC 版本，更适合功能验证和提前适配；对稳定性要求较高的生产项目建议选择稳定版 Vue 模板。

## 代码规范

- **ESLint**：使用 `@antfu/eslint-config`，单引号、无分号、自动排序 imports
- **OxLint**：作为 ESLint 的补充，提供更快的 lint 速度
- **Commitlint**：提交信息需遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
