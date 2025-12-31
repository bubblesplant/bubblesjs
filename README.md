# BubblesJS

<p>
  <a href="https://github.com/435012357/bubblesjs/blob/main/LICENSE"><img src="https://img.shields.io/github/license/435012357/bubblesjs?style=flat-square&colorA=564341&colorB=EDED91" alt="license"></a>
</p>

English | [简体中文](./README.zh-CN.md)

A modern JavaScript/TypeScript monorepo providing utilities, Vue 3 components, and project scaffolding tools.

## ✨ Features

- 🚀 Modern toolchain with TypeScript support
- 📦 Modular packages - use only what you need
- 🎨 Vue 3 component library with AI chart and annotation components
- 🛠️ CLI tool for quick project scaffolding
- ⚡ Lightweight and tree-shakeable

## 📦 Packages

| Package | Description | Version |
| --- | --- | --- |
| [@bubblesjs/utils](./packages/utils) | Common utility functions | [![npm](https://img.shields.io/npm/v/@bubblesjs/utils.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/utils) |
| [@bubblesjs/request](./packages/request) | HTTP request wrapper for Axios/Alova | [![npm](https://img.shields.io/npm/v/@bubblesjs/request.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/request) |
| [@bubblesjs/vue-ai-chart](./packages/vue-ai-chart) | AI-powered chart component for Vue 3 | [![npm](https://img.shields.io/npm/v/@bubblesjs/vue-ai-chart.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/vue-ai-chart) |
| [@bubblesjs/vue-annotation](./packages/vue-annotator) | Text annotation component for Vue 3 | [![npm](https://img.shields.io/npm/v/@bubblesjs/vue-annotation.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/vue-annotation) |
| [@bubblesjs/vue-infinite-scroll](./packages/vue-infinite-scroll) | Infinite scroll component for Vue 3 | [![npm](https://img.shields.io/npm/v/@bubblesjs/vue-infinite-scroll.svg?style=flat-square)](https://www.npmjs.com/package/@bubblesjs/vue-infinite-scroll) |
| [create-bubbles](./packages/create-bubbles) | CLI scaffolding tool | [![npm](https://img.shields.io/npm/v/create-bubbles.svg?style=flat-square)](https://www.npmjs.com/package/create-bubbles) |

## 🚀 Quick Start

### Create a new project

```bash
# npm
npm create bubbles@latest

# pnpm
pnpm create bubbles

# yarn
yarn create bubbles
```

### Install packages

```bash
# Utils
pnpm add @bubblesjs/utils

# Request
pnpm add @bubblesjs/request

# Vue components
pnpm add @bubblesjs/vue-ai-chart
pnpm add @bubblesjs/vue-annotation
pnpm add @bubblesjs/vue-infinite-scroll
```

## 📄 License

[MIT](./LICENSE) License © 2024-Present

