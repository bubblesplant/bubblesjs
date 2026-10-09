# Monorepo Template

基于 **pnpm workspace + Vite+ + Vue 3 + VitePress + Changesets** 的 monorepo 模板。参考 `antv-next-pro` 的工程结构，提供可运行的应用、文档站和可构建的内部共享 TypeScript 包。

根项目、`docs`、`playground` 和 `@bubblesjs/utils` 均为 `private: true`，目前没有 npm 发布对象。`@bubblesjs` scope 同样用于内部包标识；Changesets 与发布流程保留给将来新增的公开包。

## 环境与启动

通过 create-bubbles 创建项目，在交互菜单中选择 **Monorepo → pnpm + vp monorepo**，或直接指定模板：

```bash
pnpm create bubbles my-monorepo -t pnpm-vp-monorepo
cd my-monorepo
```

- Node.js 24（最低 24.11.0；`.node-version` / `mise.toml` 固定 24.21.0）
- pnpm 12.10.1（`packageManager` 固定版本）

```bash
pnpm install
pnpm dev
# 另一个终端启动文档
pnpm docs:dev
```

Playground 在 <http://localhost:5173>，文档在 <http://localhost:5174>。Playground 通过源码 alias 消费 `@bubblesjs/utils`，首次开发无需预构建共享包；文档站点独立运行。

## 目录结构

```text
apps/
  playground/          Vue 3 示例应用，验证共享包的实际使用
  docs/                VitePress 中文文档
packages/
  utils/               内部共享工具包，ESM / CJS / 类型声明
tsconfig/              共享严格 TypeScript 配置（base / node / vue）
.changeset/            版本记录及发布配置
.github/workflows/     Windows / Linux CI、手动发布及文档部署
.vite-hooks/           暂存文件检查、Conventional Commits 校验
```

## 常用命令

| 命令                                                      | 作用                                           |
| --------------------------------------------------------- | ---------------------------------------------- |
| `pnpm dev` / `pnpm preview`                               | 启动 / 预览 playground                         |
| `pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:preview` | 文档开发 / 构建 / 预览                         |
| `pnpm build`                                              | 按工作区依赖顺序构建所有包与应用               |
| `pnpm test`                                               | 执行共享包单元测试，不进入 watch 模式          |
| `pnpm typecheck`                                          | 根配置、共享包、Vue 应用及文档的类型检查       |
| `pnpm lint`                                               | Oxlint 检查 TS/JS，ESLint 检查 Vue SFC         |
| `pnpm format` / `pnpm format:check`                       | 格式化 / 检查格式                              |
| `pnpm check`                                              | 格式、lint、类型和单元测试                     |
| `pnpm verify:packages`                                    | 本地构建并验证 ESM/CJS、消费类型与打包文件清单 |
| `pnpm ready` / `pnpm run ci`                              | 完整检查、全量构建和本地产物验证               |
| `pnpm changeset`                                          | 为将来公开包记录版本变更                       |
| `pnpm version-packages`                                   | 更新将来公开包的版本、CHANGELOG 和锁文件       |
| `pnpm release`                                            | 为将来公开包保留的 Changesets npm 发布流程     |
| `pnpm hooks:install`                                      | 初始化 Git 后手动安装提交检查 hooks            |

Vite+ 统一提供 dev/build/pack/test/lint/fmt/run。任务缓存由 Vite+ 管理；构建产物验证和聚合质量检查每次实际执行。`pnpm verify:packages` 只检查本地产物，不执行 npm 发布。

pnpm 12 的 `pnpm ci` 是清理后安装依赖的内置命令。执行本项目的完整验证请使用 `pnpm ready` 或 `pnpm run ci`。

## 复制为新项目

1. 复制源码，跳过 `node_modules`、`dist`、`.vitepress/cache`、`.vitepress/dist`。
2. 修改根 `package.json` 的项目名。内部包默认沿用 `@bubblesjs` scope；只有更换 scope 时，才同步替换包名、`workspace:*` 依赖、alias、TS paths、消费类型示例及文档中的 `@bubblesjs`。
3. 替换各 `LICENSE` 中的年份和版权人，按需要修改许可证。将来新增公开包时，再填写 `author`、`repository`、`homepage`、`bugs`；发布到 npm 的账户需拥有 `@bubblesjs` scope 或对应组织的包发布权限。
4. 执行 `pnpm install` 更新锁文件，然后运行 `pnpm ready`。
5. 如需 Git hooks，先初始化 Git（新仓库可执行 `git init -b main`），再运行 `pnpm hooks:install`。源码压缩包或尚未初始化 Git 的目录也可以正常安装。

`pnpm hooks:install` 执行 `vp config --hooks-dir .vite-hooks --no-agent`，手动安装暂存文件检查与 Conventional Commits 校验。`pnpm install` 负责安装依赖，Git hooks 在初始化仓库后按需启用。

模板使用 TypeScript 6.x（`^6.0.3`），工作区统一从 catalog 获取版本。升级到 TypeScript 7 前应验证 Volar 的支持情况。VitePress 使用与 Vite 8 兼容的 `2.0.0-alpha.20`，升级时一起验证文档构建。

## 扩展工作区

新增应用放在 `apps/*`，共享包放在 `packages/*`。每个项目创建独立 `package.json`。内部共享包和应用设为 `private: true`；应用名称可继续使用 `playground`、`docs` 等，无需添加 scope。若将来复制 utils 为公开包，例如 `@bubblesjs/math`，须显式移除 `private: true`，设置 `publishConfig.access` 为 `public` 并完善发布元信息。

外部依赖使用 `catalog:`，版本集中维护在 `pnpm-workspace.yaml`；工作区依赖使用 `workspace:*`。复制 `packages/utils` 可得到带测试和双格式导出的共享包；复制 `apps/playground` 可得到 Vue 应用。修改包名后同步更新 import、alias 和消费类型测试。

共享 TS 配置放在根目录 `tsconfig/`，通过相对路径 `extends` 使用。Vue 应用使用 `tsconfig/vue.json`，Node / 库使用 `tsconfig/node.json`，它们继承 `tsconfig/base.json`。这是普通配置目录，不包含 `package.json`，也不作为工作区包或依赖。

详细说明见 [快速开始](apps/docs/guide/getting-started.md)、[工作区约定](apps/docs/guide/workspace.md) 和 [发布指南](apps/docs/guide/release.md)。

## CI、发布与文档部署

推送 `main` 或创建 PR 时，CI 在 Linux 和 Windows 上执行 `pnpm ready`，使用与本地一致的 Node 和 pnpm 版本。

将来新增公开包后，Release 工作流需先设置仓库变量 `RELEASE_ENABLED=true`，再从 `main` 手动运行。无 `NPM_TOKEN` 时只创建版本 PR，有 token 时支持 npm 发布。仓库需允许 GitHub Actions 创建 PR。首次使用之前完成包名、许可证、仓库元信息和 npm 权限的配置。

文档工作流手动运行。将 GitHub Pages 的构建来源设为 **GitHub Actions**，工作流会根据仓库名设置 `DOCS_BASE`。本地默认为 `/`，也可指定部署子路径（例如 PowerShell：`$env:DOCS_BASE = '/my-project/'`，然后 `pnpm docs:build`）。
