import path from 'node:path'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig, loadEnv } from 'vite-plus'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Inspect from 'vite-plugin-inspect'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const root = process.cwd()
  const env = loadEnv(mode, root)
  const { VITE_PORT } = env

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: VITE_PORT,
      host: '0.0.0.0',
      open: false,
      proxy: {},
    },
    plugins: [
      Vue(),
      AutoImport({
        imports: ['vue', 'vue-router'],
        resolvers: [ElementPlusResolver()],
        dts: './src/types/auto-import.d.ts',
      }),
      Components({
        resolvers: [ElementPlusResolver()],
        dts: './src/types/components.d.ts',
      }),
      createSvgIconsPlugin({
        // Specify the icon folder to be cached
        iconDirs: [path.resolve(__dirname, 'src/assets/icon')],
        // Specify symbolId format
        symbolId: 'icon-[dir]-[name]',
      }),
      Inspect(),
    ],
  }
})
