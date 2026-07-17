import { defineConfig } from 'vite-plus/pack'

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    platform: 'browser',
    dts: true,
  },
])
