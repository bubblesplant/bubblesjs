import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import Button from '../src/index.vue'

describe('Button', () => {
  it('renders with title prop', async () => {
    const { getByRole } = render(Button, {
      props: {
        title: 'Click me',
      },
    })

    const button = getByRole('button')
    await expect.element(button).toHaveTextContent('Click me')
  })

  it('renders different titles', async () => {
    const { getByRole } = render(Button, {
      props: {
        title: '提交',
      },
    })

    await expect.element(getByRole('button')).toHaveTextContent('提交')
  })
})
