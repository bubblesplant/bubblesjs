---
layout: home
title: 首页
hero:
  name: Monorepo Starter
  text: 把应用、共享包与文档放进同一个工作区
  tagline: pnpm 管理依赖，Vite+ 编排质量与构建，Changesets 记录版本变更。复制模板后即可开始自己的项目。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/getting-started
    - theme: alt
      text: 查看工作区约定
      link: /guide/workspace
features:
  - title: 应用与共享包
    details: apps/ 放置应用和独立运行的文档站点，packages/ 放置可独立构建的内部共享代码。
  - title: 集中管理依赖
    details: 外部依赖使用 catalog:，工作区依赖使用 workspace:*，在根目录维护版本与锁文件。
  - title: 可验证的包产物
    details: 类型、测试、构建与包产物检查贯穿本地和 CI，Changesets 为将来的公开包保留版本变更流程。
---
