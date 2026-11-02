export default {
  lint: {
    // 模板是独立项目，依赖与类型检查由各自的项目配置管理。
    ignorePatterns: ['packages/create-bubbles/template-*/**'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  staged: {
    '*': 'vp check --fix --no-lint --no-error-on-unmatched-pattern',
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
}
