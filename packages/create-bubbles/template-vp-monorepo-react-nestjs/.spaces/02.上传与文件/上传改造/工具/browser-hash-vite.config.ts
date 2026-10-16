import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

/** 单独构建真实模块的验证入口，避免向业务页面添加测试路由。 */
export default defineConfig(() => {
  if (!process.env.FILE_HASH_PROBE_DIST) throw new Error('需要指定 FILE_HASH_PROBE_DIST')
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    publicDir: false,
    build: {
      outDir: process.env.FILE_HASH_PROBE_DIST,
      emptyOutDir: false,
      rollupOptions: {
        input: fileURLToPath(new URL('./browser-hash-probe.html', import.meta.url)),
      },
    },
  }
})
