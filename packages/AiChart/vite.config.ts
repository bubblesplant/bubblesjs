import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: './playground',
  plugins: [vue(), UnoCSS()],
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
