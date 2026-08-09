import { defineConfig } from '@bubblesjs/i18n-cli'

export default defineConfig({
  callNames: ['tr'],
  projects: {
    web: {
      include: ['apps/web/src/**/*.{js,jsx,ts,tsx}'],
      catalogs: {
        zh_CN: 'apps/web/src/locales/zh_CN.json',
        en_US: 'apps/web/src/locales/en_US.json',
      },
    },
    webVue: {
      include: ['apps/web-vue/src/**/*.{js,ts,vue}'],
      catalogs: {
        zh_CN: 'apps/web-vue/src/locales/zh_CN.json',
        en_US: 'apps/web-vue/src/locales/en_US.json',
      },
    },
  },
  report: '.bubbles-i18n/report.json',
})
