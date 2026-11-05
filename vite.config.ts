export default {
  lint: {
    // 模板是独立项目，依赖与类型检查由各自的项目配置管理。
    ignorePatterns: ['packages/create-bubbles/template-*/**'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  staged: {
    // 显式使用 Node 入口，避免 Windows 的 vp.cmd 转义触发命令长度限制。
    '*': 'node node_modules/vite-plus/bin/vp check --fix --no-lint --no-error-on-unmatched-pattern',
  },
  fmt: {
    // 这两个独立模板由 ESLint 格式化，避免仓库钩子覆盖其格式与字段顺序。
    ignorePatterns: [
      'packages/create-bubbles/template-vp-vue-eslint-vapor/**',
      'packages/create-bubbles/template-vue-vp-eslint/**',
    ],
    semi: false,
    singleQuote: true,
  },
}
