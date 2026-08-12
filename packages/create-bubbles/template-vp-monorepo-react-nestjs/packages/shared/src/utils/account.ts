export const ACCOUNT_PATTERN = /^[A-Za-z0-9_]+$/

export function normalizeAccount(value: string) {
  return value.trim().toLowerCase()
}
