# 快速开始

这个模板把应用、共享包、文档和工程配置组织到一个 pnpm 工作区。示例应用使用 `@bubblesjs/utils`，文档站点独立运行。你可以沿着示例应用的依赖关系继续添加自己的功能。

根项目、`docs`、`playground` 和 `@bubblesjs/utils` 均为 `private: true`，目前没有 npm 发布对象。utils 是内部共享包，仍可构建 ESM/CJS 和类型声明。

## 环境要求

- Node.js `>=24.11.0 <25`
- pnpm `12.10.1`，与根目录 `package.json` 的 `packageManager` 保持一致

仓库通过 `.node-version` 和 `mise.toml` 固定 Node.js `24.21.0`，便于本地与 CI 使用同一版本。

在项目根目录安装依赖，然后启动应用：

```bash
pnpm install
pnpm dev
```

文档站点使用 VitePress，单独启动：

```bash
pnpm docs:dev
```

示例应用默认使用 `http://localhost:5173`，文档默认使用 `http://localhost:5174`。两个开发服务都启用了 `strictPort`，端口被占用时会提示错误。打开终端中输出的本地地址即可浏览。

Playground 通过源码别名消费共享包，修改 `packages/utils/src/` 后即可在示例应用中观察变化。

## 常用命令

以下命令均在仓库根目录运行：

| 命令                    | 用途                                         |
| ----------------------- | -------------------------------------------- |
| `pnpm dev`              | 启动示例应用                                 |
| `pnpm docs:dev`         | 启动文档站点                                 |
| `pnpm check`            | 运行质量检查与测试                           |
| `pnpm ready`            | 完整验证：质量检查、测试、构建与包产物检查   |
| `pnpm build`            | 构建工作区内的包、应用和文档                 |
| `pnpm test`             | 运行单元测试                                 |
| `pnpm typecheck`        | 检查工作区的 TypeScript 和 Vue 类型          |
| `pnpm verify:packages`  | 检查本地 ESM/CJS 和类型产物，不执行 npm 发布 |
| `pnpm changeset`        | 为将来公开包的变更添加版本记录               |
| `pnpm version-packages` | 消费 changeset，更新将来公开包的版本与日志   |
| `pnpm release`          | 为将来公开包保留的 npm 发布流程              |
| `pnpm hooks:install`    | 初始化 Git 后手动安装提交检查 hooks          |

提交前推荐运行 `pnpm ready`。备用命令是 `pnpm run ci`，显式执行根 `package.json` 中的 `ci` 脚本。在 pnpm 12 中，`ci` 是内置安装命令，因此调用同名项目脚本需要保留 `run`。

只运行某个应用或包时，可以使用 pnpm 的过滤器。例如：

```bash
pnpm --filter docs build
pnpm --filter docs preview
pnpm --filter @bubblesjs/utils test
```

## 用模板开始自己的项目

1. 把仓库复制到自己的项目目录，设置自己的 Git 远程仓库。
2. 修改根 `package.json` 的 `name`，内部包默认沿用 `@bubblesjs` scope，私有应用名称无需更改。只有更换 scope 时，才同步修改包名、工作区引用、源码别名和包产物检查脚本。
3. 替换文档标题、描述、首页内容和示例应用内容。
4. 更新作者和许可证信息。将来新增公开包时，再完善 `repository`、`homepage`、`bugs` 等发布元信息；若复制 utils 作为公开包，须显式移除 `private: true` 并设置 `publishConfig.access` 为 `public`。
5. 执行 `pnpm install` 更新锁文件，然后运行 `pnpm ready` 完成全部验证。

如需启用提交前的暂存文件检查与 Conventional Commits 校验，先初始化 Git（新仓库可执行 `git init -b main`），再运行 `pnpm hooks:install`。依赖安装完成后，Git hooks 由这个命令按需启用。

添加新代码之前，先阅读[工作区约定](./workspace)。需要发布 npm 包时，完成[版本与发布](./release)中的初始化步骤。
