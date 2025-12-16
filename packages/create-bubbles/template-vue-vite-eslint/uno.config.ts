import presetAttributify from '@unocss/preset-attributify'
import presetWind4 from '@unocss/preset-wind4'
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
      'content-h-full': 'h-[calc(100vh-var(--plus-header-height)-2*var(--el-main-padding))]',
    },
  ],
  presets: [
    presetWind4(),
    presetAttributify(),
  ],
})
