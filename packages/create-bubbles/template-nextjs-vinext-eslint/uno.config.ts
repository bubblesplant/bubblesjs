import { defineConfig, presetAttributify, presetIcons, presetWind4 } from 'unocss'

export default defineConfig({
  content: {
    filesystem: ['src/**/*.{tsx,ts,jsx,js,html}'],
  },
  presets: [presetWind4(), presetAttributify(), presetIcons()],
})
