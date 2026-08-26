import vue from '@vitejs/plugin-vue'
import type { PackUserConfig, TsdownPlugin } from 'vite-plus/pack'
import UnoCSS from 'unocss/vite'
import { defineConfig, lazyPlugins } from 'vite-plus'

const pack: PackUserConfig = {
  platform: 'neutral',
  dts: { vue: true },
  plugins: [vue() as unknown as TsdownPlugin],
}

export default defineConfig({
  pack,
  root: './playground',
  plugins: lazyPlugins(() => [vue(), UnoCSS()]),
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
})
