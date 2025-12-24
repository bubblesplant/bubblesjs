import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: './playground',
  plugins: [vue(), UnoCSS()],
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
})
