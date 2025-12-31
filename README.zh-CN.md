# BubblesJS

<p>
  <a href="https://github.com/435012357/bubblesjs/blob/main/LICENSE"><img src="https://img.shields.io/github/license/435012357/bubblesjs?style=flat-square&colorA=564341&colorB=EDED91" alt="license"></a>
</p>

[English](./README.md) | 简体中文

一个现代化的 JavaScript/TypeScript monorepo，提供工具函数、Vue 3 组件和项目脚手架工具。

## ✨ 特性

- 🚀 现代化工具链，完整 TypeScript 支持
- 📦 模块化包设计，按需使用
- 🎨 Vue 3 组件库，包含 AI 图表和文本标注组件
- 🛠️ CLI 脚手架工具，快速创建项目
- ⚡ 轻量级，支持 Tree-shaking

## 📦 包列表

| 包名 | 描述 | 版本 |
| --- | --- | --- |
| [@bubblesjs/utils](./packages/utils) | 通用工具函数库 | [![npm](https://img.shields.io/npm/v/@bubblesjs/utils.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/utils) |
| [@bubblesjs/request](./packages/request) | HTTP 请求封装（支持 Axios/Alova） | [![npm](https://img.shields.io/npm/v/@bubblesjs/request.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/request) |
| [@bubblesjs/vue-ai-chart](./packages/vue-ai-chart) | Vue 3 AI 图表组件 | [![npm](https://img.shields.io/npm/v/@bubblesjs/vue-ai-chart.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/vue-ai-chart) |
| [@bubblesjs/vue-annotation](./packages/vue-annotator) | Vue 3 文本标注组件 | [![npm](https://img.shields.io/npm/v/@bubblesjs/vue-annotation.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/vue-annotation) |
| [@bubblesjs/vue-infinite-scroll](./packages/vue-infinite-scroll) | Vue 3 无限滚动组件 | [![npm](https://img.shields.io/npm/v/@bubblesjs/vue-infinite-scroll.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/vue-infinite-scroll) |
| [create-bubbles](./packages/create-bubbles) | CLI 脚手架工具 | [![npm](https://img.shields.io/npm/v/create-bubbles.svg?style=flat-square)](https://www.npmjs.com/package/create-bubbles) |

## 🚀 快速开始

### 创建新项目

```bash
# npm
npm create bubbles@latest

# pnpm
pnpm create bubbles

# yarn
yarn create bubbles
```

### 安装包

```bash
# 工具函数
pnpm add @bubblesjs/utils

# 请求库
pnpm add @bubblesjs/request

# Vue 组件
pnpm add @bubblesjs/vue-ai-chart
pnpm add @bubblesjs/vue-annotation
pnpm add @bubblesjs/vue-infinite-scroll
```

## 📄 许可证

[MIT](./LICENSE) License © 2024-Present

