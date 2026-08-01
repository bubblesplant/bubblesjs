export interface AccessTokenClaims {
  /** 用户id */
  sub: string
  /**
   * 账户认证版本号 Account Epoch
   */
  ae: number
  /** 会话id 为了进行多端登录 */
  sid: string
  /** 会话版本号 Session Version  就是一个端体格版本号 可以单独踢出一个端 */
  sv: number
  /** jwt 令牌id */
  jti: string
  /**
   * 令牌签发者
   */
  iss: string
  /**
   * 令牌接收者  这个token是签发给谁使用的  多服务
   */
  aud: string | string[]
  /** 令牌签发时间 */
  iat: number
  /**
   * 令牌过期时间
   */
  exp: number
}

export interface AuthPrincipal {
  userId: string
  sessionId: string
  accountEpoch: number
  sessionVersion: number
  tokenId: string
}

export interface AccountAuthState {
  userId: string
  status: 'active' | 'locked' | 'disabled'
  epoch: number
}

export interface SessionAuthState {
  sessionId: string
  userId: string
  status: 'active' | 'revoked'
  version: number
  expiresAtMs: number
}

export interface AuthStateSnapshot {
  account: AccountAuthState
  session: SessionAuthState
}

export interface IssuedTokenPair {
  accessToken: string
  accessExpiresIn: number
  refreshToken: string
}
