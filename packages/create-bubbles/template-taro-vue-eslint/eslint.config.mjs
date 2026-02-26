import antfu from '@antfu/eslint-config'

export default antfu(
  {
    extends: ['taro/vue3'],
    formatters: true,
    unocss: true,
    vue: true,
    typescript: true,
    stylistic: {
      indent: 2, // 4, or 'tab'
      quotes: 'single', // or 'double'
    },
    // Parse the `.gitignore` file to get the ignores, on by default
    gitignore: true,
  },
)
