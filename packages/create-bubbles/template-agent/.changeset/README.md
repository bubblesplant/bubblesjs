# Changesets

根项目、`docs` 和 `playground` 均为 `private: true`。共享包位于 `packages/agent-core`，发布前需完善包元信息并检查发布配置。根目录 `tsconfig/` 是普通配置目录，不作为工作区包，也不参与版本与发布。

修改需要发布的包后运行 `pnpm changeset`，选择包、版本类型并填写变更说明。

合并变更后运行 `pnpm version-packages` 更新版本和锁文件；运行 `pnpm release` 发布。
公开包可使用 `@bubblesjs/<名称>`，例如 `@bubblesjs/math`。创建公开包时，须确保未设置 `private: true`，设置 `publishConfig.access` 为 `public` 并完善发布元信息，确认 npm 账户拥有对应的包发布权限；更换包名时同步替换引用。完整步骤见 `apps/docs/guide/release.md`。
