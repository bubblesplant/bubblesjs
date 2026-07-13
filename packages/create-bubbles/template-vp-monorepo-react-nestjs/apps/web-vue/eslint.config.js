import antfu from '@antfu/eslint-config'
import oxlint from 'eslint-plugin-oxlint'

export default antfu(
  {
    formatters: {
      css: true,
      html: true,
    },
    vue: true,
    unocss: true,
  },
).append(...oxlint.configs['flat/recommended'])
