import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: {
    html: true,
    css: true,
    markdown: 'prettier',
  },
  unocss: true,
  nextjs: true,
  jsx: {
    a11y: true,
  },
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/public/**',
    '**/*.md',
  ],
})
