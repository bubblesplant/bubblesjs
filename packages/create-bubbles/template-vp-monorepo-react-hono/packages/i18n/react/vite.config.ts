import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['./src/index.tsx'],
    format: ['esm'],
    platform: 'neutral',
    target: 'es2020',
    dts: true,
    clean: true,
    treeshake: true,
    deps: {
      neverBundle: ['react', /^react\//, /^@bubblesjs\//],
    },
  },
})
