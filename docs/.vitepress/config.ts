import { fileURLToPath } from 'node:url'
import { defineConfig, type DefaultTheme } from 'vitepress'

const repository = 'https://github.com/435012357/bubblesjs'

const packages = [
  ['@bubblesjs/request', 'request'],
  ['@bubblesjs/utils', 'utils'],
  ['@bubblesjs/vue-ai-chart', 'vue-ai-chart'],
  ['@bubblesjs/vue-annotation', 'vue-annotator'],
  ['@bubblesjs/vue-infinite-scroll', 'vue-infinite-scroll'],
] as const

const templates = [
  'vue-vite-eslint',
  'vp-vue-eslint-vapor',
  'react-rsbuild-biome',
  'vp-react',
  'vp-react-shadcn',
  'vp-monorepo-react-nestjs',
  'taro-vue-eslint',
  'taro-react-oxc',
  'nextjs-vinext-eslint',
  'create-eletron-vite',
]

function navigation(english = false): DefaultTheme.NavItem[] {
  const prefix = english ? '/en/' : '/'

  return [
    { text: english ? 'Guide' : '指南', link: `${prefix}guide/`, activeMatch: '/guide/' },
    {
      text: english ? 'Packages' : '工具包',
      link: `${prefix}packages/`,
      activeMatch: '/packages/',
    },
    {
      text: english ? 'Templates' : '模板',
      link: `${prefix}templates/`,
      activeMatch: '/templates/',
    },
  ]
}

function sidebar(english = false): DefaultTheme.Sidebar {
  const prefix = english ? '/en/' : '/'
  const sections = ['guide', 'packages', 'templates']

  // Keep section configurations identical so navigation preserves sidebar state.
  return Object.fromEntries(
    sections.map((section) => {
      const groups: DefaultTheme.SidebarItem[] = [
        {
          text: english ? 'Get started' : '开始使用',
          items: [
            { text: english ? 'Introduction' : '介绍', link: `${prefix}guide/` },
            {
              text: english ? 'Quick start' : '快速开始',
              link: `${prefix}guide/start/quick-start`,
            },
          ],
        },
        {
          text: english ? 'Packages' : '工具包',
          collapsed: false,
          items: [
            { text: english ? 'Overview' : '工具包总览', link: `${prefix}packages/` },
            ...packages.map(([text, path]) => ({ text, link: `${prefix}packages/${path}` })),
          ],
        },
        {
          text: english ? 'Project templates' : '项目模板',
          collapsed: true,
          items: [
            { text: english ? 'Overview' : '模板总览', link: `${prefix}templates/` },
            ...templates.map((name) => ({
              text: name === 'vue-vite-eslint' ? 'vue-vp-eslint' : name,
              link: `${prefix}templates/${name}`,
            })),
          ],
        },
      ]

      return [`${prefix}${section}/`, groups]
    }),
  )
}

export default defineConfig({
  vite: {
    resolve: {
      alias: [
        {
          find: /^.*\/VPDocAsideOutline\.vue$/,
          replacement: fileURLToPath(
            new URL('./theme/components/BubblesOutline.vue', import.meta.url),
          ),
        },
      ],
    },
  },
  srcDir: 'docs',
  outDir: 'doc_build',
  base: '/bubblesjs/',
  title: 'Bubbles',
  description: '让开发像泡泡一样轻盈。BubblesJS 项目模板、组件与工具库。',
  lang: 'zh-CN',
  appearance: true,
  cleanUrls: true,
  rewrites: {
    'zh/:rest*': ':rest*',
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/bubblesjs/bubbles-icon.svg' }],
    ['meta', { name: 'theme-color', content: '#f6f7ff' }],
  ],
  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
  },
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      themeConfig: {
        nav: navigation(),
        sidebar: sidebar(),
        outline: { label: '本页目录', level: [2, 3] },
        docFooter: { prev: '上一篇', next: '下一篇' },
        editLink: { text: '在 GitHub 上编辑此页' },
        returnToTopLabel: '返回顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '主题',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        langMenuLabel: '切换语言',
        skipToContentLabel: '跳转到内容',
        footer: {
          message: '基于 MIT 许可发布',
          copyright: 'BubblesJS · 让开发像泡泡一样轻盈',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      description:
        'Make development feel lighter. Project templates, components, and utilities by BubblesJS.',
      themeConfig: {
        nav: navigation(true),
        sidebar: sidebar(true),
        outline: { label: 'On this page', level: [2, 3] },
        docFooter: { prev: 'Previous page', next: 'Next page' },
        editLink: { text: 'Edit this page on GitHub' },
        footer: {
          message: 'Released under the MIT License',
          copyright: 'BubblesJS · Make development feel lighter',
        },
      },
    },
  },
  themeConfig: {
    logo: { src: '/bubbles-icon.svg', alt: 'Bubbles' },
    siteTitle: 'Bubbles',
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: {
      pattern: `${repository}/edit/main/docs/docs/:path`,
    },
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '清除搜索',
                backButtonTitle: '返回',
                noResultsText: '没有找到相关结果',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车键',
                  navigateText: '切换',
                  navigateUpKeyAriaLabel: '向上方向键',
                  navigateDownKeyAriaLabel: '向下方向键',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc 键',
                },
              },
            },
          },
        },
      },
    },
  },
})
