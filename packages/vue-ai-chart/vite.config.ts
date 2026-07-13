import tsdownConfig from './tsdown.config.js';

import vue from '@vitejs/plugin-vue'
import { playwright } from 'vite-plus/test/browser-playwright'
import UnoCSS from 'unocss/vite'
import { defineConfig, lazyPlugins } from 'vite-plus'

export default defineConfig({
  pack: tsdownConfig,
  root: './playground',
  plugins: lazyPlugins(() => [vue(), UnoCSS()]),
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' },   // 实例1: Chrome
        { browser: 'firefox' },    // 实例2: Firefox
        { browser: 'webkit' },     // 实例3: Safari
      ],
      // headless: true
    }
  },
})
