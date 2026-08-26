import vue from '@vitejs/plugin-vue'
/// <reference types="vitest/config" />
import type { PackUserConfig } from 'vite-plus/pack'
import { playwright } from 'vite-plus/test/browser-playwright'
import type { UserConfig } from 'vite-plus'
import { defineConfig, lazyPlugins } from 'vite-plus'

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
