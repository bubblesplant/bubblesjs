export type SessionTerminalType = 'web' | 'desktop' | 'mobile'

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

export type RegisterResult = AuthUser

export interface LoginResult {
  accessToken: string
  tokenType: 'Bearer'
  idleExpiresIn: number
  absoluteExpiresAt: string
}

export interface CurrentUser extends AuthUser {
  terminal: SessionTerminalType
}

export interface LogoutResult {
  loggedOut: true
}
