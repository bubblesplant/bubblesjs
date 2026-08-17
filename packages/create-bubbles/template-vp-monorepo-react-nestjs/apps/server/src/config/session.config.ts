import { registerAs } from '@nestjs/config'

function readPositiveInteger(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10)

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

export default registerAs('session', () => {
  const tokenPepper = process.env.SESSION_TOKEN_PEPPER
  /**
   * 没有置换的情况下的过期时间 2个小时
   */
  const idleTtlSeconds = readPositiveInteger('SESSION_IDLE_TTL_SECONDS', 7200)
  /**
   * 绝对过期时间7天
   */
  const absoluteTtlSeconds = readPositiveInteger('SESSION_ABSOLUTE_TTL_SECONDS', 604800)

  if (!tokenPepper || tokenPepper.length < 32) {
    throw new Error('SESSION_TOKEN_PEPPER must contain at least 32 characters')
  }

  if (absoluteTtlSeconds <= idleTtlSeconds) {
    throw new Error('SESSION_ABSOLUTE_TTL_SECONDS must be greater than idle TTL')
  }

  return {
    tokenPepper,
    idleTtlMs: +idleTtlSeconds * 1000,
    absoluteTtlMs: +absoluteTtlSeconds * 1000,
  }
})
