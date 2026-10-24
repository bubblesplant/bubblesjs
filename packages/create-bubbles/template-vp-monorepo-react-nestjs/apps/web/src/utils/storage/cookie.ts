export interface CookieOptions {
  path?: string
  domain?: string
  expires?: Date
  /** 有效期，单位为秒；优先于 expires。 */
  maxAge?: number
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export const cookie = {
  /** 按编码后的名称查找 Cookie 并解码值，格式损坏时保留原值。 */
  get(key: string): string | null {
    const prefix = `${encodeURIComponent(key)}=`
    const entry = document.cookie.split(';').find((item) => item.trim().startsWith(prefix))
    if (entry === undefined) return null

    const value = entry.trim().slice(prefix.length)
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  },

  /** 写入同名 Cookie；令牌变化或显式删除时同步通知本地会话清理。 */
  set(key: string, value: string, options: CookieOptions = {}): void {
    const previous = key === 'token' ? cookie.get(key) : null
    const { path = '/', domain, expires, maxAge, sameSite = 'Lax' } = options
    const secure = options.secure ?? window.location.protocol === 'https:'
    const attributes = [
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      `Path=${path}`,
      `SameSite=${sameSite}`,
    ]

    if (domain) attributes.push(`Domain=${domain}`)
    if (expires) attributes.push(`Expires=${expires.toUTCString()}`)
    if (maxAge !== undefined) attributes.push(`Max-Age=${Math.trunc(maxAge)}`)
    if (secure) attributes.push('Secure')

    document.cookie = attributes.join('; ')
    if (key === 'token' && (previous !== cookie.get(key) || maxAge === 0))
      window.dispatchEvent?.(new Event('auth-session-change'))
  },

  /** 删除时 path、domain 须与写入一致；令牌已过期时仍通知各模块清理本地会话。 */
  remove(
    key: string,
    options: Pick<CookieOptions, 'path' | 'domain' | 'secure' | 'sameSite'> = {},
  ): void {
    cookie.set(key, '', { ...options, maxAge: 0, expires: new Date(0) })
  },
}
