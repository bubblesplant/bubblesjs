import { detectSessionTerminal } from '@/common/constants/session.constants'
import { AppException } from '@/common/exceptions/app.exception'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthUser, LogoutResult, RegisterResult } from 'shared/types'
import { normalizeAccount } from 'shared/utils'
import { AUTH_ERRORS } from './auth.errors'
import { AuthRepository } from './auth.repository'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { PasswordService } from './password.service'
import { SessionStoreService } from './session/session-store.service'
import { SessionTokenService } from './session/session-token.service'

interface LoginMetadata {
  ip: string
  userAgent: string
}

const LOGIN_DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$/sDN9pcO6kkAcm+ncFtbdA$vmQIsQtUG9E+s22x70njKji67RJDseq12y/sYFG7iNk'

@Injectable()
export class AuthService {
  private readonly idleExpiresIn: number

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly sessionStoreService: SessionStoreService,
    config: ConfigService,
  ) {
    this.idleExpiresIn = Math.floor(config.getOrThrow<number>('session.idleTtlMs') / 1000)
  }

  async register(input: RegisterDto): Promise<RegisterResult> {
    const account = normalizeAccount(input.account)
    const passwordHash = await this.useAuthInfrastrutrue(() =>
      this.passwordService.hash(input.password),
    )
    const user = await this.useAuthInfrastrutrue(() =>
      this.authRepository.createUser({
        name: input.name.trim(),
        account,
        passwordHash,
      }),
    )
    if (!user) {
      throw new AppException(AUTH_ERRORS.ACCOUNT_ALREADY_EXISTS)
    }

    return {
      id: user.id,
      name: user.name,
      account: user.account,
    }
  }

  async login(input: LoginDto, metadata: LoginMetadata) {
    const account = normalizeAccount(input.account)
    const user = await this.useAuthInfrastrutrue(() => this.authRepository.findByAccount(account))
    const passwordHash = user?.status === 'active' ? user.passwordHash : LOGIN_DUMMY_PASSWORD_HASH
    const passwordMatches = await this.useAuthInfrastrutrue(() =>
      this.passwordService.verify(passwordHash, input.password),
    )

    if (!user || user.status !== 'active' || !passwordMatches) {
      throw new AppException(AUTH_ERRORS.INVALID_CREDENTIALS)
    }

    const { rawToken, tokenDigest } = this.sessionTokenService.createToken()

    const session = await this.sessionStoreService.createOrReplace({
      tokenDigest,
      userId: user.id,
      terminal: detectSessionTerminal(metadata.userAgent),
      loginIp: metadata.ip.slice(0, 64),
      userAgent: metadata.userAgent.slice(0, 500),
    })

    return {
      accessToken: rawToken,
      tokenType: 'Bearer' as const,
      idleExpiresIn: this.idleExpiresIn,
      absoluteExpiresAt: new Date(session.absoluteExpiresAtMs).toISOString(),
    }
  }

  private async useAuthInfrastrutrue<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (cause: unknown) {
      if (cause instanceof AppException) {
        throw cause
      }
      throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, { cause })
    }
  }

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.useAuthInfrastrutrue(() =>
      this.authRepository.findPublicById(userId).catch((cause: unknown) => {
        throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, { cause })
      }),
    )

    if (!user || user.status !== 'active') {
      throw new AppException(AUTH_ERRORS.SESSION_INVALID)
    }

    return {
      id: user.id,
      account: user.account,
      name: user.name,
    }
  }

  async logout(authorization: string | undefined): Promise<LogoutResult> {
    const rawToken = this.sessionTokenService.extractBearerToken(authorization)
    if (!rawToken) {
      return { loggedOut: true }
    }

    const tokenDigest = this.sessionTokenService.digest(rawToken)
    await this.sessionStoreService.logout(tokenDigest)
    return { loggedOut: true }
  }
}
