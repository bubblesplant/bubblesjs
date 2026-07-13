import tsdownConfig from './tsdown.config.js';

import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig, lazyPlugins } from 'vite-plus'

export default defineConfig({
  pack: tsdownConfig,
  root: './playground',
  plugins: lazyPlugins(() => [vue(), UnoCSS()]),
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
})
