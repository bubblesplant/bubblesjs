# 工作区约定

## 目录职责

```text
apps/
  playground/       示例应用
  docs/             VitePress 文档站点
packages/
  utils/            内部共享工具包
tsconfig/           共享 TypeScript 配置（base / node / vue）
```

`apps/*` 和 `packages/*` 由 `pnpm-workspace.yaml` 纳入工作区。根目录负责公共命令、依赖版本目录、锁文件、质量检查和 CI；每个子项目维护自己的入口、依赖和脚本。

根项目、`docs`、`playground` 和 `@bubblesjs/utils` 均为 `private: true`，目前没有 npm 发布对象。应用名称可继续使用 `playground`、`docs` 等，`@bubblesjs` scope 同样用于内部共享包标识。共享包放在 `packages/`，提供明确的 `exports` 和类型入口。共享 TypeScript 配置放在根目录 `tsconfig/`，通过相对路径复用。

## 外部依赖使用 `catalog:`

所有工作区共享的第三方依赖版本统一声明在根 `pnpm-workspace.yaml` 的 `catalog` 中：

```yaml
catalog:
  vue: ^3.5.0
```

子项目只声明需要哪些依赖：

```json
{
  "dependencies": {
    "vue": "catalog:"
  }
}
```

上面的版本仅用于展示格式；以仓库内的目录配置为准。添加外部依赖时，先在 `catalog` 中确定版本，再在实际使用它的项目中写 `catalog:`。运行 `pnpm install`，将清单和根锁文件一起提交。

## 内部依赖使用 `workspace:*`

应用或其他包依赖共享包时，按包名声明。例如 Playground 的内部依赖：

```json
{
  "dependencies": {
    "@bubblesjs/utils": "workspace:*"
  }
}
```

`workspace:*` 要求使用当前仓库内的包，避免安装同名的远程包。打包或发布时，pnpm 会把该协议转换为实际版本。

应用可配置源码别名获得即时开发反馈；发布包仍需要正确的 `exports`、构建结果和类型声明。使用者导入包名，避免引用其他项目的内部文件路径。

## 添加共享包

1. 在 `packages/` 中创建目录，例如 `packages/math/`。
2. 添加 `package.json`，设置唯一的包名，例如 `@bubblesjs/math`。内部共享包设置 `private: true`。若将来需要 npm 发布，须显式移除 `private: true`，设置 `publishConfig.access` 为 `public`，并完善 `version`、`type`、`files`、`exports` 和发布元信息；复制 utils 创建公开包时同样需要这些步骤。
3. 添加 `src/index.ts` 作为公共入口，将需要对外开放的 API 显式导出。
4. 参考 `packages/utils/` 配置构建、测试和类型检查，继承根目录 `tsconfig/` 中适用的配置。
5. 在使用它的项目中添加 `workspace:*` 依赖。需要源码开发时，同步配置 Vite 与 TypeScript 别名。
6. 执行 `pnpm install`、`pnpm typecheck`、`pnpm test`、`pnpm build`。为新共享包补充本地产物检查，再执行 `pnpm verify:packages`；这个命令不执行 npm 发布。
7. 如需 npm 发布，补充发布元信息，并添加 changeset。

一个包只对外公开稳定的入口。把业务代码拆成包时，先确认它需要独立复用或发布，再划定依赖边界。

## 添加应用

1. 在 `apps/` 中创建目录，例如 `apps/admin/`。
2. 添加唯一的 `package.json` 名称和 `private: true`。声明 `dev`、`build`、`typecheck` 等实际需要的脚本。
3. 使用 `catalog:` 引用外部依赖，使用 `workspace:*` 引用共享包。
4. 继承共享 TypeScript 配置，并添加对应框架的构建配置。
5. 执行 `pnpm install`，然后通过 `pnpm --filter admin dev` 启动该应用。
6. 将常用入口补充到根脚本或文档中，确保全工作区构建和类型检查都能运行。

应用之间通过共享包复用代码，避免一个应用直接导入另一个应用的源码。

## 共享配置和文档

Vue 应用与文档通过 `"extends": "../../tsconfig/vue.json"` 继承共享配置；Node / 库使用 `tsconfig/node.json`，基础约束定义在 `tsconfig/base.json`。覆盖配置时只声明项目所需的差异。

`tsconfig/` 是普通配置目录，没有 `package.json`，不参与工作区依赖管理或 npm 发布。子项目通过相对路径继承，无需声明配置包依赖。

文档页面放在 `apps/docs/`，使用 Markdown 编写并由 VitePress 构建。当前文档站点独立运行；共享包的实际使用由 Playground 示例应用展示。
