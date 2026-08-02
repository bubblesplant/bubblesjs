import { AuthConfig } from '@/config/auth.config'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHmac, randomBytes, randomUUID } from 'crypto'
import { AccessTokenClaims } from './auth.types'

@Injectable()
export class RefreshTokenCodec {
  constructor(private readonly config: ConfigService) {}

  create() {
    const raw = randomBytes(32).toString('base64url')
    return {
      raw,
      hash: this.hash(raw),
    }
  }

  hash(raw: string) {
    const auth = this.config.getOrThrow<AuthConfig>('auth')
    return createHmac('sha256', auth.refreshPepper).update(raw).digest('hex')
  }
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async sign(input: {
    userId: string
    sessionId: string
    accountEpoch: number
    sessionVersion: number
  }) {
    const auth = this.config.getOrThrow<AuthConfig>('auth')
    const accessToken = await this.jwt.signAsync({
      sub: String(input.userId),
      sid: input.sessionId,
      ae: input.accountEpoch,
      sv: input.sessionVersion,
      jti: randomUUID(),
    })

    return {
      accessToken,
      accessExpireIn: auth.accessTtlSeconds,
    }
  }

  async verify(raw: string) {
    let claims: AccessTokenClaims

    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(raw)
    } catch {
      throw new UnauthorizedException('访问令牌无效或已过期')
    }

    const auth = this.config.getOrThrow<AuthConfig>('auth')

    const validShape =
      /^[1-9]\d*$/.test(claims.sub) &&
      typeof claims.sid === 'string' &&
      claims.sid.length > 0 &&
      typeof claims.jti === 'string' &&
      claims.jti.length > 0 &&
      Number.isSafeInteger(claims.ae) &&
      claims.ae >= 1 &&
      Number.isSafeInteger(claims.sv) &&
      claims.sv >= 1 &&
      Number.isSafeInteger(claims.iat) &&
      Number.isSafeInteger(claims.exp) &&
      claims.exp > claims.iat &&
      claims.exp - claims.iat <= auth.accessTtlSeconds + auth.clockToleranceSeconds

    if (!validShape) {
      throw new UnauthorizedException('访问令牌无效或已过期')
    }
    return claims
  }
}
