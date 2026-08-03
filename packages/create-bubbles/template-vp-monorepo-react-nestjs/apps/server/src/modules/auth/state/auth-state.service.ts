import { AuthConsistency } from '@/common/constants/auth'
import { DRIZZLE, type DrizzleDB } from '@/database/db.module'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { AccessTokenClaims, AccountAuthState, SessionAuthState } from '../auth.types'

type ProjectionWriteResult = 'applied' | 'identical' | 'stale'

const READ_AUTH_STATE_LUA = [
  `local accountEpoch = redis.call('HGET', KEYS[1], 'epoch' or ''`,
  `local accountStatus = redis.call('HGET', KEYS[1], 'status') or ''`,
  `local sessionVersion = redis.call('HGET', KEYS[2], 'version') or ''`,
  `local sessionStatus = redis.call('HGET', KEYS[2], 'status') or ''`,
  `local sessionUserId = redis.call('HGET', KEYS[2], 'user_id') or ''`,
  `local sessionExpiresAtMs = redis.call('HGET', KEYS[2], 'expiresAtMS') or ''`,
  `return {`,
  `  accountEpoch,`,
  `  accountStatus,`,
  `  sessionVersion,`,
  `  sessionStatus,`,
  `  sessionUserId,`,
  `  sessionExpiresAtMs,`,
  `}`,
].join('\n')

const ACCOUNT_PROJECTION_LUA = [
  `local currentEpoch = redis.call('HGET', KEYS[1], 'epoch')`,
  `local incomingEpoch = tonumber(ARGV[1])`,
  ``,
  `if not incomingEpoch then`,
  `  return -2`,
  `end`,
  ``,
  `if ARGV[2] ~= 'active`,
  `  and ARGV[2] ~= 'locked'`,
  `  and ARGV[2] ~= 'disabled' then`,
  `  return -2`,
  `end`,
  ``,
  `if not currentEpoch then`,
  `  if redis.call('EXISTS', KEYS[1]) == 1 then`,
  `    return -2`,
  `  end`,
  `else`,
  `  local parsedCurrentEpoch = tonumber(currentEpoch)`,
  `  local currentStatus = redis.call('HGET', KEYS[1], 'status')`,
  ``,
  '  if parsedCurrentEpoch > incomingEpoch then',
  '    return 0',
  '  end',
  '',
  '  if parsedCurrentEpoch == incomingEpoch then',
  '    if currentStatus == ARGV[2] then',
  '      return 2',
  '    end',
  '',
  '    return -1',
  '  end',
  'end',
  '',
  "redis.call('HSET', KEYS[1],",
  "  'epoch', ARGV[1],",
  "  'status', ARGV[2])",
  'return 1',
].join('\n')

const SESSION_PROJECTION_LUA = [
  "local currentVersion = redis.call('HGET', KEYS[1], 'version')",
  'local incomingVersion = tonumber(ARGV[1])',
  'local expiresAtMs = tonumber(ARGV[4])',
  'local ttlSeconds = tonumber(ARGV[5])',
  '',
  'if not incomingVersion',
  '  or not expiresAtMs',
  '  or not ttlSeconds',
  '  or ttlSeconds <= 0',
  "  or ARGV[3] == ''",
  "  or (ARGV[2] ~= 'active' and ARGV[2] ~= 'revoked') then",
  '  return -2',
  'end',
  '',
  'if not currentVersion then',
  "  if redis.call('EXISTS', KEYS[1]) == 1 then",
  '    return -2',
  '  end',
  'else',
  '  local parsedCurrentVersion = tonumber(currentVersion)',
  "  local currentStatus = redis.call('HGET', KEYS[1], 'status')",
  "  local currentUserId = redis.call('HGET', KEYS[1], 'userId')",
  "  local currentExpiresAtMs = redis.call('HGET', KEYS[1], 'expiresAtMs')",
  '',
  '  if not parsedCurrentVersion',
  '    or not currentStatus',
  '    or not currentUserId',
  '    or not currentExpiresAtMs',
  "    or (currentStatus ~= 'active'",
  "      and currentStatus ~= 'revoked') then",
  '    return -2',
  '  end',
  '',
  '  if parsedCurrentVersion > incomingVersion then',
  '    return 0',
  '  end',
  '',
  '  if parsedCurrentVersion == incomingVersion then',
  '    if currentStatus == ARGV[2]',
  '      and currentUserId == ARGV[3]',
  '      and currentExpiresAtMs == ARGV[4] then',
  "      redis.call('EXPIRE', KEYS[1], ttlSeconds)",
  '      return 2',
  '    end',
  '',
  '    return -1',
  '  end',
  '',
  "  if currentStatus == 'revoked' and ARGV[2] == 'active' then",
  '    return -1',
  '  end',
  'end',
  '',
  "redis.call('HSET', KEYS[1],",
  "  'version', ARGV[1],",
  "  'status', ARGV[2],",
  "  'userId', ARGV[3],",
  "  'expiresAtMs', ARGV[4])",
  "redis.call('EXPIRE', KEYS[1], ttlSeconds)",
  'return 1',
].join('\n')

function accountKey(userId: string) {
  return `auth:account:{${userId}}`
}

function sessionKey(userId: string, sessionId: string) {
  return `auth:session:{${userId}}:${sessionId}`
}

@Injectable()
export class AuthStateService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ConfigService,
  ) {}

  private async readShared(
    userId: string,
    sessionId: string,
  ): Promise<{
    account: AccountAuthState | null
    session: SessionAuthState | null
  }> {
    try {
      const raw = await this.redis.eval(
        READ_AUTH_STATE_LUA,
        2,
        accountKey(userId),
        sessionKey(userId, sessionId),
      )

      if (!Array.isArray(raw) || raw.length !== 6) {
        throw new Error('Redis Auth State 返回结构错误')
      }

      const [
        accountEpoch,
        accountStatus,
        sessionVersion,
        sessionStatus,
        sessionUserId,
        sessionExpiresAtMs,
      ] = raw.map((value) => String(value ?? ''))

      return {
        account: this.parseAccount(userId, accountEpoch, accountStatus),
        session: this.parseSession(
          userId,
          sessionId,
          sessionVersion,
          sessionStatus,
          sessionUserId,
          sessionExpiresAtMs,
        ),
      }
    } catch {
      throw new ServiceUnavailableException('共享健全状态暂时不可用')
    }
  }

  async verify(claims: AccessTokenClaims, _consistency: AuthConsistency = 'strong') {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const shared = await this.readShared(claims.sub, claims.sid)
    }
  }
}
