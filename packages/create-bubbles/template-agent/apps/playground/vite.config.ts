import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
  },
  run: {
    tasks: {
      bundle: {
        command: 'vp build',
        cache: {
          env: ['NODE_ENV'],
        },
      },
    },
  },
})
