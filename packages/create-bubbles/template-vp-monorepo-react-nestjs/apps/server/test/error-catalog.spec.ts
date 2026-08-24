import { COMMON_ERRORS } from '@/common/error/common.error'
import { AUTH_ERRORS } from '@/modules/auth/auth.errors'
import { describe, expect, it } from 'vite-plus/test'

const definitions = [...Object.values(COMMON_ERRORS), ...Object.values(AUTH_ERRORS)]

describe('error catalog', () => {
  it('uses valid and globally unique error codes', () => {
    const codes = definitions.map((definition) => definition.code)

    expect(new Set(codes).size).toBe(codes.length)

    for (const definition of definitions) {
      expect(definition.code).toMatch(/^[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)+$/)
      expect(definition.code.length).toBeLessThanOrEqual(80)
      expect(definition.status).toBeGreaterThanOrEqual(400)
      expect(definition.status).toBeLessThanOrEqual(599)
      expect(definition.publicMessage.trim()).not.toBe('')
    }
  })

  it('keeps bearerChallenge and HTTP 401 in sync', () => {
    for (const definition of definitions) {
      const hasBearerChallenge =
        'bearerChallenge' in definition && definition.bearerChallenge === true

      expect(hasBearerChallenge).toBe(definition.status === 401)
    }
  })
})
