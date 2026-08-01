import { registerAs } from '@nestjs/config'

export interface AuthConfig {
  /**
   * access token jwt 签发密钥
   */
  accessSecret: string
  /**
   * jwt 签发方
   */
  issuer: string
  /**
   * jwt 接收方 多服务
   */
  audience: string
  /**
   * access token 有效期 单位为秒
   */
  accessTtlSeconds: number
  /**
   * refresh token 有效期 单位为秒
   */
  refreshTtlSeconds: number
  /**
   * 就是refres_token 提交后 我们用这个去解析出 token hash 再和数据库的对比
   */
  refreshPepper: string
  /**
   * jwt 额外的存活时间误差 单位为秒
   */
  clockToleranceSeconds: number
  /**
   * 这个来控制jwt 的多久需要和服务器同步一下版本
   */
  localCacheTtlMs: number
  /**
   * jwt 失效后在保存多少时间从redis 移除 单位为秒
   */
  tombstoneTtlSeconds: number
  /**
   * refresh token cookie 名称
   */
  cookieName: string
  /**
   * refresh token cookie 路径
   */
  cookiePath: string
  /**
   * refresh token cookie 是否需要 https 协议传输
   */
  cookieSecure: boolean
  /**
   * cookie 在那些子域名生效
   */
  cookieDomain?: string
  /**
   * auth 状态变更事件通道
   */
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
