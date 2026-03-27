import path from 'path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig, loadEnv } from 'vite-plus'

export default defineConfig(({ mode }) => {
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
      port: Number(VITE_PORT),
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      AutoImport({
        imports: ['react', 'react-router', 'react-dom'],
        dts: './src/types/auto-imports.d.ts',
      }),
      tailwindcss(),
    ],
    staged: {
      '*': 'vp check --fix',
    },
  }
})
