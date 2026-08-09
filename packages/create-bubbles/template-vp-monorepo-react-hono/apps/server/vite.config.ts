import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/index.bun.ts', 'src/worker.ts'],
    format: ['esm'],
    sourcemap: true,
    clean: true,
    dts: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
