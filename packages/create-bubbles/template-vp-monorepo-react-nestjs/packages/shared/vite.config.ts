import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      index: './src/index.ts',
      types: './src/types/index.ts',
      utils: './src/utils/index.ts',
    },
    format: ['esm'],
    platform: 'neutral',
    target: 'es2020',
    dts: true,
    clean: true,
    treeshake: true,
  },
})
