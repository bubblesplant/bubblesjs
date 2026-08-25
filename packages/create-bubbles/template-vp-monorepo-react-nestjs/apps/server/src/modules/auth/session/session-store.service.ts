import {
  createSessionKey,
  createSessionSlotKey,
  isSessionTerminal,
  SESSION_KEY_PREFIX,
  SESSION_SLOT_PREFIX,
  SESSION_TERMINALS,
} from '@/common/constants/session.constants'
import { AppException } from '@/common/exceptions/app.exception'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { AUTH_ERRORS } from '../auth.errors'
import {
  CREATE_OR_REPLACE_SESSION_SCRIPT,
  LOGOUT_SESSION_SCRIPT,
  REVOKE_USER_SESSIONS_SCRIPT,
  VALIDATE_AND_TOUCH_SESSION_SCRIPT,
} from './session.script'
import { CreatedSession, CreateSessionInput, CurrentAuthType } from './session.types'

const INVALID_SESSION_CODES = new Set(['NOT_FOUND', 'REPLACED', 'ABSOLUTE_EXPIRED'])

type SessionRedis = Redis & {
  authCreateOrReplaceSession(...args: string[]): Promise<unknown>
  authValidateAndTouchSession(...args: string[]): Promise<unknown>
  authLogoutSession(...args: string[]): Promise<unknown>
  authRevokeUserSessions(...args: string[]): Promise<unknown>
}

const SCRIPT_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,79}$/

function createScriptProtocolError(operation: string, value: string | undefined): Error {
  const code = SCRIPT_CODE_PATTERN.test(value ?? '') ? value : 'UNKNOWN'
  return new Error(`Redis ${operation} script returned ${code}`)
}

@Injectable()
export class SessionStoreService {
  // private readonly logger = new Logger(SessionStoreService.name)
  private readonly redis: SessionRedis
  private readonly idleTtlMs: number
  private readonly absoluteTtlMs: number

  constructor(@InjectRedis() redis: Redis, config: ConfigService) {
    this.redis = redis as SessionRedis
    this.idleTtlMs = config.getOrThrow<number>('session.idleTtlMs')
    this.absoluteTtlMs = config.getOrThrow<number>('session.absoluteTtlMs')

    this.redis.defineCommand('authCreateOrReplaceSession', {
      numberOfKeys: 2,
      lua: CREATE_OR_REPLACE_SESSION_SCRIPT,
    })

    this.redis.defineCommand('authValidateAndTouchSession', {
      numberOfKeys: 1,
      lua: VALIDATE_AND_TOUCH_SESSION_SCRIPT,
    })

    this.redis.defineCommand('authLogoutSession', {
      numberOfKeys: 1,
      lua: LOGOUT_SESSION_SCRIPT,
    })

    this.redis.defineCommand('authRevokeUserSessions', {
      numberOfKeys: SESSION_TERMINALS.length,
      lua: REVOKE_USER_SESSIONS_SCRIPT,
    })
  }

  private async execute(command: () => Promise<unknown>) {
    try {
      const result = await command()

      if (!Array.isArray(result)) {
        throw new Error('Redis script returned a non-array result')
      }
      return result.map((item) => String(item ?? ''))
    } catch (cause: unknown) {
      throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, { cause })
    }
  }

  async createOrReplace(input: CreateSessionInput): Promise<CreatedSession> {
    const result = await this.execute(() =>
      this.redis.authCreateOrReplaceSession(
        createSessionSlotKey(input.userId, input.terminal),
        createSessionKey(input.tokenDigest),
        input.tokenDigest,
        input.userId,
        input.terminal,
        String(this.idleTtlMs),
        String(this.absoluteTtlMs),
        input.loginIp,
        input.userAgent,
        SESSION_KEY_PREFIX,
      ),
    )

    // if (result[0] !== '1') {
    //   this.logger.error(`Create session script rejected: ${result[1] ?? 'UNKNOWN'}`)
    //   throw new ServiceUnavailableException('暂时无法创建登录状态')
    // }

    const initialExpiresAtMs = Number(result[2])
    const absoluteExpiresAtMs = Number(result[3])

    // if (!Number.isFinite(initialExpiresAtMs) || !Number.isFinite(absoluteExpiresAtMs)) {
    //   throw new ServiceUnavailableException('登录状态数据异常')
    // }

    return {
      initialExpiresAtMs,
      absoluteExpiresAtMs,
    }
  }

  async validateAndTouch(tokenDigest: string): Promise<CurrentAuthType | null> {
    const result = await this.execute(() =>
      this.redis.authValidateAndTouchSession(
        createSessionKey(tokenDigest),
        tokenDigest,
        SESSION_SLOT_PREFIX,
        String(this.idleTtlMs),
      ),
    )

    if (result[0] !== '1') {
      const code = result[1] ?? 'UNKNOWN'

      if (INVALID_SESSION_CODES.has(code)) {
        return null
      }

      // this.logger.error(`Validate session script returned unexpected code: ${code}`)
      // throw new ServiceUnavailableException('登录状态数据异常')
      throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, {
        cause: createScriptProtocolError('validateAndTouch', result[0]),
      })
    }

    const userId = result[1]
    const terminal = result[2]

    // if (!userId || !terminal || !isSessionTerminal(terminal)) {
    //   this.logger.error('Redis returned an invalid Session payload')
    //   throw new ServiceUnavailableException('登录状态数据异常')
    // }

    if (!userId || !terminal || !isSessionTerminal(terminal)) {
      throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, {
        cause: createScriptProtocolError('validateAndTouch', result[0]),
      })
    }

    return {
      userId,
      terminal,
    }
  }

  async logout(tokenDigest: string) {
    const result = await this.execute(() =>
      this.redis.authLogoutSession(createSessionKey(tokenDigest), tokenDigest, SESSION_SLOT_PREFIX),
    )

    // if (result[0] !== '1') {
    //   this.logger.error(`Logout session script returned unexpected code: ${result[1] ?? 'UNKNOWN'}`)
    //   throw new ServiceUnavailableException('暂时无法完成退出')
    // }

    if (result[0] !== '1') {
      throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, {
        cause: createScriptProtocolError('logout', result[0]),
      })
    }
  }

  async revokeAllForUser(userId: string) {
    const slotKeys = SESSION_TERMINALS.map((terminal) => createSessionSlotKey(userId, terminal))
    const result = await this.execute(() =>
      this.redis.authRevokeUserSessions(...slotKeys, SESSION_KEY_PREFIX),
    )
    // if (result[0] !== '1') {
    //   this.logger.error(
    //     `Revoke user sessions script returned unexpected code: ${result[1] ?? 'UNKNOWN'}`,
    //   )
    //   throw new ServiceUnavailableException('暂时无法撤销用户登录状态')
    // }

    if (result[0] !== '1') {
      throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, {
        cause: createScriptProtocolError('revokeAllForUser', result[0]),
      })
    }
  }
}
