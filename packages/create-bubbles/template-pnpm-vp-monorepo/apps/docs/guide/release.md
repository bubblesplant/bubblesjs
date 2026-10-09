# 版本与发布

根项目、`docs`、`playground` 和 `@bubblesjs/utils` 均为 `private: true`，目前没有 npm 发布对象。utils 用于内部共享，仍可构建与验证 ESM/CJS 和类型声明；`pnpm verify:packages` 是本地产物检查，不执行 npm 发布。

以下 Changesets 流程保留给将来新增的公开包，例如 `@bubblesjs/math` 或 `@bubblesjs/i18n`。

根目录 `tsconfig/` 只保存共享 TypeScript 配置，不作为工作区包，也不参与版本与发布。

## 初始化自己的发布信息

第一次发布前，完成以下配置：

1. 将来的公开包默认使用 `@bubblesjs/<名称>`，例如 `@bubblesjs/math`，私有应用名称无需更改。若复制 utils 作为公开包，须显式移除 `private: true` 并设置 `publishConfig.access` 为 `public`。只有更换 scope 时，才同步更新包名、工作区引用、Vite 与 TypeScript 别名，以及包产物检查脚本。
2. 更新包清单中的 `repository`、`homepage`、`bugs`、作者和许可证信息，确保链接指向自己的项目。
3. 检查 `.changeset/config.json` 的默认分支。模板使用 `main`；你的仓库若使用其他分支，需要同步修改配置与工作流。
4. 确认可发布包的 `files`、`exports`、类型入口和版本，并保持 `publishConfig.access` 为 `public`。模板初始版本是起点，首次发布的目标版本由 changeset 决定。
5. 发布到 npm 的账户需拥有 `@bubblesjs` scope 或对应组织的包发布权限。在 GitHub 仓库配置具有目标包发布权限的 `NPM_TOKEN` secret，并将仓库变量 `RELEASE_ENABLED` 设置为字符串 `true`，启用发布工作流。

执行 `pnpm install` 更新锁文件，再执行 `pnpm ready` 完成质量检查、测试、构建与包产物检查。验证通过后再进行发布。

## 记录包的变更

当修改会影响共享包的使用者时，运行：

```bash
pnpm changeset
```

选择受影响的包、版本级别，并写清行为变化。将生成的 `.changeset/*.md` 与实现一起提交。现有私有项目（包括 utils）不参与 npm 发布，此流程用于将来的公开包。

## 本地更新版本和发布

```bash
pnpm version-packages
pnpm install
pnpm ready
```

检查包版本、变更日志和锁文件，提交版本变更后，在具有 npm 发布权限的环境运行：

```bash
pnpm release
```

`version-packages` 消费 changeset 并修改仓库文件；`release` 会把符合条件的新版本发布到 npm。先确认包名、目标版本和构建产物。

## GitHub 发布工作流

`.github/workflows/release.yml` 使用手动触发 `workflow_dispatch`，并要求在 `main` 分支运行。在 Actions 页面运行它之前，先完成上述发布配置。

- `RELEASE_ENABLED` 未设置为 `true` 时，发布任务跳过。
- 启用后，Changesets Action 可以创建或更新版本 PR。
- 版本 PR 合并后，再次手动运行工作流可发布新版本；仅配置了 `NPM_TOKEN` 时才执行 npm 发布。

模板不会因一次普通代码推送自动开启 npm 发布。自己的包完成初始化后，可根据团队流程调整触发条件。

## 部署文档

文档的静态输出位于 `apps/docs/.vitepress/dist/`。本地构建和预览：

```bash
pnpm --filter docs build
pnpm --filter docs preview
```

默认站点路径是 `/`。部署到子路径时，通过 `DOCS_BASE` 设置，例如在 PowerShell 中：

```powershell
$env:DOCS_BASE = '/my-repository/'
pnpm --filter docs build
```

使用 GitHub Pages 时，在仓库设置里将 Pages 的构建来源设置为 GitHub Actions，然后手动运行 `.github/workflows/docs.yml`。工作流根据仓库名称计算 `DOCS_BASE`，上传文档产物并执行 Pages 部署。组织或用户首页仓库，以及自定义域名部署，需确认最终路径与实际访问地址一致。
