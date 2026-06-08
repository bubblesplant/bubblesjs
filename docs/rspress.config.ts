import * as path from 'node:path'

import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
import { defineConfig } from '@rspress/core'

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  globalStyles: path.join(__dirname, 'tailwind.css'),
  base: '/bubblesjs/',
  title: 'Bubbles',
  icon: '',
  logo: '',
  logoText: 'Bubbles',
  lang: 'zh',
  locales: [
    {
      lang: 'en',
      label: 'English',
      title: 'Bubbles',
      description: 'Bubbles is a modern, lightweight, and fast component library.',
    },
    {
      lang: 'zh',
      label: '简体中文',
      title: 'Bubbles',
      description: 'Bubbles 是一个现代、轻量级且快速的组件库。',
    },
  ],
  themeConfig: {
    darkMode: true,
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/435012357/bubblesjs',
      },
    ],
    locales: [
      {
        lang: 'en',
        label: 'On this page',
      },
      {
        lang: 'zh',
        label: '大纲',
      },
    ],
  },
  builderConfig: {
    plugins: [pluginTailwindcss()],
  },
})
