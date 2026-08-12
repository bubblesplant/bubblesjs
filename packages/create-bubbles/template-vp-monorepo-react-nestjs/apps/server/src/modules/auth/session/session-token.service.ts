import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, randomBytes } from 'node:crypto'

@Injectable()
export class SessionTokenService {
  private readonly tokenPepper: string

  constructor(config: ConfigService) {
    this.tokenPepper = config.getOrThrow<string>('session.tokenPepper')
  }

  digest(rawToken: string) {
    return createHmac('sha256', this.tokenPepper).update(rawToken).digest('hex')
  }

  createToken() {
    const rawToken = randomBytes(32).toString('base64url')
    return {
      rawToken,
      tokenDigest: this.digest(rawToken),
    }
  }

  extractBearerToken(authorization: string | undefined) {
    const matched = /^Bearer\s+([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')
    return matched?.[1] ?? null
  }
}
