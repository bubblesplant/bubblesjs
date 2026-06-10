/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard-scss'],
  rules: {
    'no-empty-source': null,
    'scss/at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'apply',
          'config',
          'custom-variant',
          'layer',
          'plugin',
          'reference',
          'responsive',
          'screen',
          'source',
          'tailwind',
          'theme',
          'utility',
          'variant',
          'variants'
        ]
      }
    ]
  }
}
