import UnoCSS from 'unocss/vite'
import vinext from 'vinext'
import { defineConfig } from 'vite-plus'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [UnoCSS(), svgr(), vinext()],
})
