import tsdownConfig from './tsdown.config.ts'
import vue from '@vitejs/plugin-vue'
/// <reference types="vitest/config" />
import { playwright } from 'vite-plus/test/browser-playwright'
import { defineConfig, lazyPlugins } from 'vite-plus'

export default defineConfig({
  pack: tsdownConfig,
  root: './playground',
  plugins: lazyPlugins(() => [vue()]),
  test: {
    root: '.',
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
})
