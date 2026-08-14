import { SESSION_TERMINALS } from '@/common/constants/session.constants'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import {
  CREATE_OR_REPLACE_SESSION_SCRIPT,
  LOGOUT_SESSION_SCRIPT,
  REVOKE_USER_SESSIONS_SCRIPT,
  VALIDATE_AND_TOUCH_SESSION_SCRIPT,
} from './session.script'

const INVALID_SESSION_CODES = new Set(['NOT_FOUND', 'REPLACED', 'ABSOLUTE_EXPIRED'])

type SessionRedis = Redis & {
  authCreateOrReplaceSession(...args: string[]): Promise<unknown>
  authValidateAndTouchSession(...args: string[]): Promise<unknown>
  authLogoutSession(...args: string[]): Promise<unknown>
  authRevokeUserSessions(...args: string[]): Promise<unknown>
}

@Injectable()
export class SessionStoreService {
  private readonly logger = new Logger(SessionStoreService.name)
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
}
