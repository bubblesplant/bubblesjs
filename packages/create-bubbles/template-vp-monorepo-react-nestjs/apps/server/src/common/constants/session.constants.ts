/**
 * 会话终端
 */
export const SESSION_TERMINALS = ['web', 'desktop', 'mobile'] as const

export type SessionTerminalType = (typeof SESSION_TERMINALS)[number]
/**
 * 用token去找 userid和 terminal
 */
export const SESSION_KEY_PREFIX = 'auth:v1:session:'
/**
 * 用userid和 terminal 找到会话
 */
export const SESSION_SLOT_PREFIX = 'auth:v1:slot:'

export function createSessionKey(tokenDigest: string) {
  return `${SESSION_KEY_PREFIX}${tokenDigest}`
}

export function createSessionSlotKey(userId: string, terminal: SessionTerminalType) {
  return `${SESSION_SLOT_PREFIX}${userId}:${terminal}`
}

export function isSessionTerminal(value: string): value is SessionTerminalType {
  return SESSION_TERMINALS.includes(value as SessionTerminalType)
}

export function detectSessionTerminal(userAgent: string | undefined): SessionTerminalType {
  const value = userAgent ?? ''

  if (/\bElectron\//i.test(value)) {
    return 'desktop'
  }

  if (/Android|iPhone|iPad|iPod/i.test(value)) {
    return 'mobile'
  }

  return 'web'
}
