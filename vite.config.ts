export default {
  staged: {
    '*': 'packages/create-bubbles/template-vp-monorepo-react-nestjs/node_modules/.bin/vp.cmd check --fix --no-lint',
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
}
