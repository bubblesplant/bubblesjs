# Changesets

根项目、`docs`、`playground` 和 `@bubblesjs/utils` 均为 `private: true`，目前没有 npm 发布对象。根目录 `tsconfig/` 是普通配置目录，不作为工作区包，也不参与版本与发布。

以下流程保留给将来新增的公开包：修改公开包后运行 `pnpm changeset`，选择包、版本类型并填写变更说明。

合并变更后运行 `pnpm version-packages` 更新版本和锁文件；运行 `pnpm release` 发布。
将来的公开包默认使用 `@bubblesjs/<名称>`，例如 `@bubblesjs/math`。若复制 utils 作为公开包，须显式移除 `private: true`，设置 `publishConfig.access` 为 `public` 并完善发布元信息，确认 npm 账户拥有 `@bubblesjs` scope 或对应组织的包发布权限；只有更换 scope 时才同步替换包名与引用。完整步骤见 `apps/docs/guide/release.md`。
