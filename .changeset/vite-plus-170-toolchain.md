---
'create-bubbles': patch
'@bubblesjs/vue-ai-chart': patch
'@bubblesjs/vue-annotation': patch
---

升级脚手架、模板和 Vue 组件库的兼容依赖，包含 Vite+ 1.7.0、配套 Vite 核心 `@voidzero-dev/vite-plus-core@8.3.8000`、UnoCSS 66.13.0、Vue 3.5.46、Playwright 1.65.1、Taro 4.3.3 和 Video.js 10.6.0，并同步已有 pnpm 锁文件。Vapor 模板沿用 Vue 3.6 RC 通道，升级至 rc.16。

两个 Vue 模板因供应链策略拒绝 Vite+ 1.7.0 新增的 `tsrs` 传递依赖，保留 Vite+ 1.6.0 和与其配套的 Oxlint 1.93，其余兼容依赖照常更新。保留 Vite+ 补丁移除状态和 Taro mini-ci 补丁；Vitest 浏览器套件与 Vite+ 内置的 5.1.0 对齐。
