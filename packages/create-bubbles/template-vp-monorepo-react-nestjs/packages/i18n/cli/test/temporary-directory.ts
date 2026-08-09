import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach } from 'vite-plus/test'

export function useTemporaryDirectory(): { readonly path: string } {
  let path = ''

  beforeEach(async () => {
    path = await mkdtemp(join(tmpdir(), 'bubbles-i18n-'))
  })

  afterEach(async () => {
    if (path !== '') {
      await rm(path, { recursive: true, force: true })
    }
  })

  return {
    get path() {
      return path
    },
  }
}
