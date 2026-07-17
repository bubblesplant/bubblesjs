import { defineConfig } from 'vite-plus/pack'

export default defineConfig(() => ({
  entry: ['src/index.ts'],
  target: 'node20',
  minify: process.env.NODE_ENV === 'production',
  fixedExtension: false,
}))
