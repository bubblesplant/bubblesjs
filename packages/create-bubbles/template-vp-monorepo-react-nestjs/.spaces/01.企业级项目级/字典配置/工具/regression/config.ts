import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite-plus'
import webConfig from '../../../../../apps/web/vite.config'

/** 传输层回归保留 Node HTTP 适配器，只替换与传输无关的浏览器国际化初始化。 */
export default defineConfig((env) => {
  const config = typeof webConfig === 'function' ? webConfig(env) : webConfig
  return mergeConfig(config, {
    test: {
      environment: 'node',
      setupFiles: [fileURLToPath(new URL('./setup.ts', import.meta.url))],
    },
  })
})
