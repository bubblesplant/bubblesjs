import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: [
    {
      entry: ['./src/index.ts'],
      platform: 'browser',
      dts: true,
    },
  ],
})
