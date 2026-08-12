import type { SessionTerminalType } from '../types'

export const SESSION_TERMINALS = [
  'web',
  'desktop',
  'mobile',
] as const satisfies readonly SessionTerminalType[]

export function isSessionTerminal(value: unknown): value is SessionTerminalType {
  return SESSION_TERMINALS.includes(value as SessionTerminalType)
}
