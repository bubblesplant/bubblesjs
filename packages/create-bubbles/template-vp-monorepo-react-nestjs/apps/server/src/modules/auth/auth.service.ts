import { detectSessionTerminal } from '@/common/constants/session.constants'
import { AppException } from '@/common/exceptions/app.exception'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthUser, ChangePasswordResult, LogoutResult, RegisterResult } from 'shared/types'
import { normalizeAccount } from 'shared/utils'
import { AUTH_ERRORS } from './auth.errors'
import { AuthRepository } from './auth.repository'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { PasswordService } from './password.service'
import { ChangePasswordDto } from './password/change-password.dto'
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

  /**
   * 读取会话闲置时长，并换算成登录响应使用的秒数。
   */
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly sessionStoreService: SessionStoreService,
    config: ConfigService,
  ) {
    this.idleExpiresIn = Math.floor(config.getOrThrow<number>('session.idleTtlMs') / 1000)
  }

  /**
   * 标准化账号并保存 Argon2 密码摘要，返回不含密码的注册资料。
   * @param input 用户提交的账号、名称和明文密码。
   * @throws 账号重复时抛出账号已存在错误，认证依赖失败时返回服务不可用错误。
   */
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

  /**
   * 校验启用账号及密码，并替换该用户在当前终端的 Redis 会话。
   * @param metadata 登录 IP 和 User-Agent，用于识别终端并记录会话来源。
   * @returns 仅本次返回的明文 Bearer 令牌及会话过期信息。
   * @throws 账号不可用或密码不匹配时抛出凭据无效错误；认证依赖失败时返回服务不可用。
   */
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

    const session = await this.useAuthInfrastrutrue(() =>
      this.authRepository.withActiveUserLock(user.id, (lockedPasswordHash) => {
        if (lockedPasswordHash !== passwordHash) {
          throw new AppException(AUTH_ERRORS.INVALID_CREDENTIALS)
        }
        return this.sessionStoreService.createOrReplace({
          tokenDigest,
          userId: user.id,
          terminal: detectSessionTerminal(metadata.userAgent),
          loginIp: metadata.ip.slice(0, 64),
          userAgent: metadata.userAgent.slice(0, 500),
        })
      }),
    )
    if (!session) throw new AppException(AUTH_ERRORS.INVALID_CREDENTIALS)

    return {
      accessToken: rawToken,
      tokenType: 'Bearer' as const,
      idleExpiresIn: this.idleExpiresIn,
      absoluteExpiresAt: new Date(session.absoluteExpiresAtMs).toISOString(),
    }
  }

  /**
   * 在认证基础设施边界执行操作，保留业务异常并将未知异常转换为认证服务不可用。
   * @returns 原操作的结果。
   */
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

  /**
   * 读取仍处于启用状态的用户公开资料。
   * @throws 用户不存在或已停用时抛出会话失效错误。
   */
  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.useAuthInfrastrutrue(() => this.authRepository.findPublicById(userId))

    if (!user || user.status !== 'active') {
      throw new AppException(AUTH_ERRORS.SESSION_INVALID)
    }

    return {
      id: user.id,
      account: user.account,
      name: user.name,
    }
  }

  /**
   * 在本人用户行排他锁内核验旧密码、写入新摘要并撤销全部终端会话。
   * Redis 撤销失败时事务回滚，旧密码保持有效；成功后当前会话也失效。
   */
  async changePassword(userId: string, input: ChangePasswordDto): Promise<ChangePasswordResult> {
    const result = await this.useAuthInfrastrutrue(() =>
      this.authRepository.withPasswordWriteLock(userId, async (context) => {
        const oldPasswordMatches = await this.passwordService.verify(
          context.passwordHash,
          input.oldPassword,
        )
        if (!oldPasswordMatches) throw new AppException(AUTH_ERRORS.OLD_PASSWORD_INCORRECT)
        if (input.newPassword === input.oldPassword) {
          throw new AppException(AUTH_ERRORS.PASSWORD_REUSE_NOT_ALLOWED)
        }

        const passwordHash = await this.passwordService.hash(input.newPassword)
        await context.setPasswordHash(passwordHash)
        await this.sessionStoreService.revokeAllForUser(userId)
        return { passwordChanged: true as const }
      }),
    )
    if (!result) throw new AppException(AUTH_ERRORS.SESSION_INVALID)
    return result
  }

  /**
   * 撤销请求令牌对应的会话；未提供有效格式的令牌时仍返回退出成功。
   */
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
