import presetAttributify from '@unocss/preset-attributify'
import presetWind3 from '@unocss/preset-wind3'
import { defineConfig } from 'unocss'

export default defineConfig({
  // content: {
  //   filesystem: [
  //     '**/*.{html,js,ts,jsx,tsx,vue,svelte,astro}',
  //   ],
  // },
  shortcuts: [
    {
      'flex-center': 'flex justify-center items-center',
    },
  ],
  presets: [
    presetWind3(),
    presetAttributify(),
  ],
})
