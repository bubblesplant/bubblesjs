import { describe, expect, it } from 'vite-plus/test'

import { defineConfig } from '../src/config.ts'

describe('defineConfig', () => {
  it('returns the same config object', () => {
    const config = {
      callNames: ['tr'],
      projects: {
        web: {
          include: ['apps/web/src/**/*.ts'],
          catalogs: { en_US: 'apps/web/src/locales/en_US.json' },
        },
      },
    }

    expect(defineConfig(config)).toBe(config)
  })
})
