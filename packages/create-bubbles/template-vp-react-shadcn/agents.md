# Agent 指南

## 项目约定

- 项目是 Vite+、React 19、TypeScript 前端应用，路径别名 `@/*` 指向 `src/*`。
- 路由使用 React Router 7，集中维护在 `src/router/index.tsx`。
- 路由页面放在 `src/pages/<route>/index.tsx`，保持现有 `lazyLoad()` 导入规则。
- `src/types/auto-imports.d.ts` 是生成文件，不要手动编辑。

## 命令

```bash
vp dev
vp check
tsc && vp build
```

## UI 与样式

- UI 组件使用 shadcn/ui，已有组件位于 `src/components/ui`。
- 新增 shadcn/ui 组件使用 `pnpm shadcn add xxx`。
- 图标优先使用 `lucide-react`。
- 动效：引人注目的关键区域可适当加入动画，复杂动效优先使用已安装的 `gsap`，避免过度动画影响可用性。
- 样式优先使用 Tailwind CSS classNames。
- 复杂、复用、嵌套样式使用 Sass CSS Module，文件命名为 `xxx.module.scss`。
- CSS Module 类名遵循 BEM：`block`、`block__element`、`block--modifier`。
- 多个 class 组合使用 `cn()`，工具位于 `src/lib/utils.ts`。
- 不要随意新增普通全局 class；全局 reset、基础变量和应用级基础规则放在 `src/styles/index.css`。

## 代码规则

- 源码内优先使用 `@/` 路径别名。
- React 组件使用 PascalCase，hooks 使用 `useXxx`，普通变量和函数使用 camelCase，常量使用 UPPER_SNAKE_CASE。
- 需要枚举值时不要使用 TypeScript `enum`，使用常量对象加类型推导。
- 接接口时参照 `src/utils/request/readme.md`，业务接口统一放在 `src/api` 并用 `alovaRequest` 封装。
- 环境变量统一使用 `src/utils/env/index.tsx` 导出的 `envVariables`，不允许在业务代码中直接使用 `import.meta.env`。
- 日期处理统一使用 `dayjs`。
- 需要工具函数时优先查看 `radashi` 是否已提供；没有合适方法时，再在 `src/utils` 下新增全局工具类。
- 需要全局状态管理时使用 `zustand`，在 `src/store` 下按业务拆分模块。

## 验证

- 普通代码改动：执行 `vp check` 和 `tsc && vp build`。
- 视觉改动：启动 `vp dev`，在浏览器中检查受影响页面。
