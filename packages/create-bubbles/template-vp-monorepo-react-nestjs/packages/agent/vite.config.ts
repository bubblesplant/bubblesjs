import { defineConfig } from 'vite-plus'
import workspaceConfig from '../../vite.config.ts'

export default defineConfig({
  fmt: workspaceConfig.fmt,
  lint: workspaceConfig.lint,
  pack: {
    entry: ['./src/index.ts', './src/process/worker.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'es2023',
    dts: true,
    clean: true,
  },
  test: {
    environment: 'node',
  },
})
