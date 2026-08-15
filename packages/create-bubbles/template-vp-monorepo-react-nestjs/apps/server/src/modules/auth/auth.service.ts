import { detectSessionTerminal } from '@/common/constants/session.constants'
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LogoutResult, RegisterResult } from 'shared/types'
import { normalizeAccount } from 'shared/utils'
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
    const passwordHash = await this.passwordService.hash(input.password)
    const user = await this.authRepository.createUser({
      name: input.name.trim(),
      account,
      passwordHash,
    })
    if (!user) {
      throw new ConflictException('账号已存在')
    }

    return {
      id: user.id,
      name: user.name,
      account: user.account,
    }
  }

  async login(input: LoginDto, metadata: LoginMetadata) {
    const account = normalizeAccount(input.account)
    const user = await this.authRepository.findByAccount(account)

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('账号或密码错误')
    }

    const passwordMatches = await this.passwordService.verify(user.passwordHash, input.password)

    if (!passwordMatches) {
      throw new UnauthorizedException('账号或密码错误')
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

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.authRepository.findPublicById(userId).catch(() => {
      throw new ServiceUnavailableException({
        code: 'USER_SERVICE_UNAVAILABLE',
        message: '暂时无法获取用户信息，请稍后重试',
      })
    })

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({
        code: 'SESSION_USER_INVALID',
        message: '用户不存在或账号已不可用，请重新登录',
      })
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
