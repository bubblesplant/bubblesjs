export type SessionTerminal = 'web' | 'desktop' | 'mobile'

export interface RegisterRequest {
  name: string
  account: string
  password: string
}

export interface LoginRequest {
  account: string
  password: string
}

export interface AuthUser {
  id: string
  account: string
  name: string
}
