import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'tsdown'

export default defineConfig({
  platform: 'neutral',
  dts: { vue: true },
  plugins: [vue()],
})
