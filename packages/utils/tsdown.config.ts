import { defineConfig } from 'vite-plus/pack'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  target: 'es2021',
  outExtensions: () => ({ js: '.js' }),
  dts: true,
  clean: true,
})
