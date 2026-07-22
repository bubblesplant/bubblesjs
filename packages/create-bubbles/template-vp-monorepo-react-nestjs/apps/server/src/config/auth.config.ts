import { registerAs } from '@nestjs/config'

export interface AuthConfig {
  accessSecret: string
  issuer: string
  audience: string
  accessTtlSeconds: number
  refreshTtlSeconds: number
  refreshPepper: string
  clockToleranceSeconds: number
  localCacheTtlMs: number
  tombstoneTtlSeconds: number
  cookieName: string
  cookiePath: string
  cookieSecure: boolean
  cookieDomain?: string
  eventChannel: string
}

function requireSecret(name: string) {
  const value = process.env[name]?.trim()

  if (!value || value.length < 32) {
    throw new Error(name + ' 必须配置，并且至少 32 个字符')
  }

  return value
}

function positiveInt(name: string, fallback: number) {
  const raw = process.env[name]

  if (!raw) {
    return fallback
  }

  const value = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(name + ' 必须是正整数')
  }

  return value
}

export default registerAs(
  'auth',
  (): AuthConfig => ({
    accessSecret: requireSecret('JWT_ACCESS_SECRET'),
    issuer: process.env.JWT_ISSUER ?? 'bubbles-auth',
    audience: process.env.JWT_AUDIENCE ?? 'bubbles-api',
    accessTtlSeconds: positiveInt('JWT_ACCESS_TTL_SECONDS', 10 * 60),
    refreshTtlSeconds: positiveInt('REFRESH_TOKEN_TTL_SECONDS', 30 * 24 * 60 * 60),
    refreshPepper: requireSecret('REFRESH_TOKEN_PEPPER'),
    clockToleranceSeconds: positiveInt('JWT_CLOCK_TOLERANCE_SECONDS', 30),
    localCacheTtlMs: positiveInt('AUTH_LOCAL_CACHE_TTL_MS', 30_000),
    tombstoneTtlSeconds: positiveInt('AUTH_TOMBSTONE_TTL_SECONDS', 15 * 60),
    cookieName: process.env.REFRESH_COOKIE_NAME ?? 'refresh_token',
    cookiePath: process.env.REFRESH_COOKIE_PATH ?? '/auth',
    cookieSecure:
      process.env.REFRESH_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    cookieDomain: process.env.REFRESH_COOKIE_DOMAIN,
    eventChannel: process.env.AUTH_EVENT_CHANNEL ?? 'auth-state:invalidate',
  }),
)
