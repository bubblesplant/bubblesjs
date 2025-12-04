import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  content: {
    filesystem: ['**/*.{html,js,ts,jsx,tsx,vue,svelte,astro}'],
  },
  rules: [
    [
      /^background-(.+)$/,
      ([, value]) => {
        // 清理和验证值
        const cleanValue = value.replace(/_/g, ' ').replace(/[^a-zA-Z0-9\s\-().%#]/g, '') // 移除可能有问题的字符

        return {
          background: cleanValue,
        }
      },
    ],
  ],
  presets: [presetWind3()],
  shortcuts: [
    {
      'flex-center': 'flex justify-center items-center',
    },
  ],
})
