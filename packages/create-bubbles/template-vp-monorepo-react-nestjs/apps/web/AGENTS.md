## 适用范围

本文件适用于 `apps/web` 及其子目录，同时遵循[根目录 AGENTS.md](../../AGENTS.md)中的通用规则。

## 自动导入

- `react`、`react-router`、`react-dom` 的 API 和类型通过 `unplugin-auto-import` 自动导入，业务代码和测试不再手动导入这些包；`react-dom/client` 的 `createRoot` 同样自动导入。
- 使用尚未覆盖的 API 或类型时，先补充 `vite.config.ts` 的自动导入配置，再由插件更新 `src/types/auto-imports.d.ts`，不要手动修改生成声明。
- 同名 API 必须配置明确的别名：React 的 `createContext` 保持原名，React Router 的 `createContext` 使用 `createRouterContext`，避免上下文类型混用。
- React 的 `ViewTransition` 使用 `ReactViewTransition` 别名，避免与浏览器原生 `ViewTransition` 全局类型冲突。

## 按需规则

根据当前任务匹配下表，在执行相关操作前读取对应规则；命中多项时分别读取。不要预先加载整个 `.agents/rules/` 目录；任务范围变化时补读新命中的规则。

| 适用条件                                                            | 规则文件                                      |
| ------------------------------------------------------------------- | --------------------------------------------- |
| 当前修改的 Web 代码文件已超过或将超过 300 行                        | [文件拆分](.agents/rules/文件拆分.md)         |
| 新增、修改或移动页面相关的 API 请求代码                             | [页面接口](.agents/rules/页面接口.md)         |
| 新增、修改、抽取或移动 React 组件，或调整组件复用范围与静态内容放置 | [组件复用](.agents/rules/组件复用.md)         |
| 新增、修改、移动或重命名 `components` 下的组件文件、组件目录或组件  | [组件命名](.agents/rules/组件命名.md)         |
| 新增、封装或修改弹窗组件，或调整其打开、关闭及传参方式              | [弹窗组件](.agents/rules/弹窗组件.md)         |
| 新增、修改或重构表格类增删改查列表页面（含草稿功能）                | [表格页面](.agents/rules/表格页面.md)         |
| 新增、修改或使用 SVG                                                | [SVG 使用](.agents/rules/SVG使用.md)          |
| 新增、修改开启浏览器回填（自动填充）的表单或输入框                  | [表单回填](.agents/rules/表单回填.md)         |
| 新增、修改交互状态样式（hover、focus、active 等）或交互动效         | [交互状态样式](.agents/rules/交互状态样式.md) |
