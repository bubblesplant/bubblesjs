import path from 'node:path'

import { AntdvNextResolver } from '@antdv-next/auto-import-resolver'
import { PlusProComponentsResolver } from '@plus-pro-components/resolver'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig, loadEnv } from 'vite'
import Inspect from 'vite-plugin-inspect'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const root = process.cwd()
  const env = loadEnv(mode, root)
  const { VITE_PORT, VITE_API_URL, VITE_API_AFFIX } = env
  console.log(env)

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },

    server: {
      port: Number(VITE_PORT),
      host: '0.0.0.0',
      open: false,

      proxy: {
        [`^/${VITE_API_AFFIX}`]: {
          target: VITE_API_URL,
          changeOrigin: true,
          // secure: false, // Disable SSL certificate verification
          rewrite: path => path.replace(new RegExp(`^/${VITE_API_AFFIX}`), ''),
        },
      },
    },
    plugins: [
      Vue(),
      AutoImport({
        imports: ['vue', 'vue-router'],
        dts: './src/types/auto-import.d.ts',
      }),
      Components({
        resolvers: [AntdvNextResolver()],
        dts: './src/types/components.d.ts',
      }),
      createSvgIconsPlugin({
        // Specify the icon folder to be cached
        iconDirs: [path.resolve(__dirname, 'src/assets/icon')],
        // Specify symbolId format
        symbolId: 'icon-[dir]-[name]',
      }),
      UnoCSS(),
      Inspect(),
    ],
  }
})
