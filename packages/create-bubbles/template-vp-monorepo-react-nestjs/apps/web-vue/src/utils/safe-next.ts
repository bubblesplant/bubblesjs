const INTERNAL_NAVIGATION_ORIGIN = 'https://wanwu.internal'

export interface AuthPathOptions {
  next?: string | null
  registered?: boolean
}

/**
 * 将外部输入约束为站内绝对路径，拒绝协议地址、协议相对地址及反斜杠绕过。
 * @param value 查询参数中待校验的跳转目标。
 * @param fallback 输入不安全或为空时使用的站内回退路径。
 */
export function safeNextPath(value: string | null | undefined, fallback = '/'): string {
  const candidate = value?.trim()
  if (!candidate?.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback
  }

  try {
    const parsed = new URL(candidate, INTERNAL_NAVIGATION_ORIGIN)
    if (parsed.origin !== INTERNAL_NAVIGATION_ORIGIN) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

/** 为登录或注册入口附加经过校验的站内 next，并可标记注册完成状态。 */
export function buildAuthPath(path: '/login' | '/register', options: AuthPathOptions = {}): string {
  const params = new URLSearchParams()
  const next = safeNextPath(options.next)
  if (next !== '/') params.set('next', next)
  if (options.registered) params.set('registered', '1')
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
