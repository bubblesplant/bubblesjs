import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite-plus/pack'

export default defineConfig({
  platform: 'neutral',
  dts: { vue: true },
  plugins: [vue()],
})
