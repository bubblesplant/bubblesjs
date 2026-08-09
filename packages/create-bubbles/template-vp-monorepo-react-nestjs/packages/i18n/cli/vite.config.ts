import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      index: './src/index.ts',
      cli: './src/cli.ts',
    },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    dts: true,
    clean: true,
    treeshake: true,
    shims: true,
    outExtensions: () => ({ js: '.mjs' }),
  },
})
