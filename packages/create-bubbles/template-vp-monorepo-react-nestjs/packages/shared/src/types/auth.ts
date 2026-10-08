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

/** 当前用户验证旧密码后修改自己的全局账号密码。 */
export interface ChangePasswordRequest {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

/** 改密成功时仅返回操作结果，不回显密码或账号资料。 */
export interface ChangePasswordResult {
  passwordChanged: true
}

/** 平台管理员为其他全局账号设定新密码。 */
export interface ResetAccountPasswordRequest {
  newPassword: string
  confirmPassword: string
}

/** 重置成功时仅返回操作结果，不回显密码或账号资料。 */
export interface ResetAccountPasswordResult {
  passwordReset: true
}
