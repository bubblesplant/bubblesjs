import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['./src/index.ts'],
    format: ['esm'],
    target: 'es2021',
    outExtensions: () => ({ js: '.js' }),
    dts: true,
    clean: true,
  },
})
