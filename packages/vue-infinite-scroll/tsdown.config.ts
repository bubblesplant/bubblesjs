import { defineConfig } from 'vite-plus/pack'

export default defineConfig({
  platform: 'neutral',
  fromVite: true,
  dts: { vue: true },
})
