import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig, loadEnv } from 'vite-plus'

export default defineConfig(({ mode }) => {
  const root = process.cwd()
  const env = loadEnv(mode, root)
  const { VITE_PORT, VITE_API_AFFIX, VITE_API_URL } = env

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: Number(VITE_PORT),
      host: '0.0.0.0',
      proxy: {
        [VITE_API_AFFIX]: {
          target: VITE_API_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(new RegExp('^' + VITE_API_AFFIX), ''),
        },
      },
    },
    plugins: [
      react(),
      AutoImport({
        imports: ['react', 'react-router', 'react-dom'],
        dts: './src/types/auto-imports.d.ts',
      }),
      tailwindcss(),
    ],
  }
})
