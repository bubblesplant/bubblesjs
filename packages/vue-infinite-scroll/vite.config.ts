import type { UserConfig } from 'vite-plus'
/// <reference types="vitest/config" />
import type { PackUserConfig } from 'vite-plus/pack'
import vue from '@vitejs/plugin-vue'
import { defineConfig, lazyPlugins } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

const pack: PackUserConfig = {
  platform: 'neutral',
  fromVite: true,
  dts: { vue: true },
}

const test = {
  root: '.',
  browser: {
    enabled: true,
    provider: playwright(),
    instances: [{ browser: 'chromium' }],
    headless: true,
  },
} as NonNullable<UserConfig['test']>

export default defineConfig({
  pack,
  root: './playground',
  plugins: lazyPlugins(() => [vue()]),
  test,
})
