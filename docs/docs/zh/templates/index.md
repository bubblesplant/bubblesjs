# 模板总览

使用 `create-bubbles` 创建项目时，先选择框架，再选择模板。以下清单与当前仓库的 CLI 配置及模板目录对应。

## CLI 内置模板

| 模板                                                            | 当前技术栈与内容                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [vue-vp-eslint](/templates/vue-vite-eslint)                     | Vue 3、Vite+、ESLint、Antdv Next、Pinia、UnoCSS。                                                        |
| [vp-vue-eslint-vapor](/templates/vp-vue-eslint-vapor)           | Vue 3.6 RC、Vapor 模式、Vite+、Antdv Next、Pinia、UnoCSS。                                               |
| [react-rsbuild-biome](/templates/react-rsbuild-biome)           | React 19、Rsbuild、Biome、Ant Design、Alova。                                                            |
| [vp-react](/templates/vp-react)                                 | React 19、Vite+、Ant Design、React Router、Tailwind CSS、Alova。                                         |
| [vp-react-shadcn](/templates/vp-react-shadcn)                   | React 19、Vite+、shadcn、Radix UI、Tailwind CSS、Sonner、Zustand。                                       |
| [vp-monorepo-react-nestjs](/templates/vp-monorepo-react-nestjs) | React 与 Vue 两套前端、NestJS / Fastify 后端、PostgreSQL、Redis、BullMQ、MinIO，以及共享代码和国际化包。 |
| [taro-vue-eslint](/templates/taro-vue-eslint)                   | Taro 4.2、Vue 3.5、NutUI、UnoCSS、Alova，面向小程序和 H5。                                               |
| [taro-react-oxc](/templates/taro-react-oxc)                     | Taro 4.2、React 18、NutUI React Taro、Tailwind CSS、Oxlint、Oxfmt。                                      |
| [nextjs-vinext-eslint](/templates/nextjs-vinext-eslint)         | Next.js 16、React 19、Vinext、ESLint、Ant Design。                                                       |

可以在交互菜单中选择，也可以直接指定模板：

```bash
pnpm create bubbles@latest my-project --template vue-vp-eslint
```

## Electron 桌面项目

CLI 的 **Others → Electron** 入口会调用外部的 `create-electron-vite` 脚手架，界面框架和项目配置由上游交互流程选择。CLI 中的选项名为 `create-eletron-vite`，保留当前源码拼写。

```bash
pnpm create bubbles@latest my-desktop --template create-eletron-vite
```

参见 [Electron 创建说明](/templates/create-eletron-vite)。

## 如何选择

- **Vue 应用**：使用 `vue-vp-eslint`；评估 Vapor 模式时选择 `vp-vue-eslint-vapor`。
- **React 应用**：使用 Vite+ 时选择 `vp-react` 或带 shadcn 的 `vp-react-shadcn`；使用 Rsbuild 与 Biome 时选择 `react-rsbuild-biome`。
- **前后端一体项目**：选择 `vp-monorepo-react-nestjs`，按需启动 React 或 Vue 前端，并配置后端基础服务。
- **小程序 / H5**：根据 Vue 或 React 选择对应 Taro 模板。
- **Next.js 风格应用**：选择 `nextjs-vinext-eslint`，运行命令与兼容事项见详情。
- **桌面应用**：通过 Electron 入口进入上游脚手架。

各模板的运行时、包管理器与启动命令有所不同，请按对应详情页完成初始化。
