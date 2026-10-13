import type { UserConfig } from 'vite-plus'
import type { PackUserConfig, TsdownPlugin } from 'vite-plus/pack'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig, lazyPlugins } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

const pack: PackUserConfig = {
  platform: 'neutral',
  dts: { vue: true },
  plugins: [vue() as unknown as TsdownPlugin],
}

const test = {
  root: '.',
  include: ['tests/**/*.test.ts'],
  browser: {
    enabled: true,
    provider: playwright(),
    instances: [
      { browser: 'chromium' }, // 实例1: Chrome
      { browser: 'firefox' }, // 实例2: Firefox
      { browser: 'webkit' }, // 实例3: Safari
    ],
    // headless: true
  },
} as NonNullable<UserConfig['test']>

export default defineConfig({
  pack,
  root: './playground',
  plugins: lazyPlugins(() => [vue(), UnoCSS()]),
  test,
})
