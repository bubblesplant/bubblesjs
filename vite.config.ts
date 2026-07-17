export default {
  lint: {"jsPlugins":[{"name":"vite-plus","specifier":"vite-plus/oxlint-plugin"}],"rules":{"vite-plus/prefer-vite-plus-imports":"error"},"options":{"typeAware":true,"typeCheck":true}},
  staged: {
    '*': 'vp check --fix --no-lint',
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
}
