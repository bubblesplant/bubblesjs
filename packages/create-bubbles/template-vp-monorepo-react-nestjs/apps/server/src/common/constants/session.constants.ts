import type { SessionTerminalType } from 'shared/types'

export { isSessionTerminal, SESSION_TERMINALS } from 'shared/utils'

export const SESSION_KEY_PREFIX = 'auth:v1:session:'
export const SESSION_SLOT_PREFIX = 'auth:v1:slot:'

export function createSessionSlotKey(userId: string, terminal: SessionTerminalType) {
  return `${SESSION_SLOT_PREFIX}${userId}:${terminal}`
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
