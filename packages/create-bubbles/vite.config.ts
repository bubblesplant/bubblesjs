import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    target: 'node20',
    minify: true,
    fixedExtension: false,
    deps: {
      onlyBundle: false as const,
    },
  },
})
