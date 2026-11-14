import antfu from '@antfu/eslint-config'
import oxlint from 'eslint-plugin-oxlint'

export default antfu({
  // 统一交给 Vite+ / Oxfmt 排版，ESLint 保留 Vue 与语义检查。
  stylistic: false,
  formatters: false,
  vue: true,
  unocss: true,
}).append(
  {
    // 模板排版也由 Oxfmt 接管，避免两套格式规则相互改写。
    rules: {
      'vue/html-closing-bracket-newline': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
    },
  },
  ...oxlint.configs['flat/recommended'],
)
