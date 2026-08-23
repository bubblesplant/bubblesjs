import { IS_PUBLIC_KEY } from '@/common/constants/auth'
import { AppException } from '@/common/exceptions/app.exception'
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AUTH_ERRORS } from '../auth.errors'
import { SessionStoreService } from '../session/session-store.service'
import { SessionTokenService } from '../session/session-token.service'
import { AuthenticatedRequest } from '../session/session.types'

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionTokenService: SessionTokenService,
    private readonly sessionStoreService: SessionStoreService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    // Cors 预检不携带业务 token , 也不会执行 Controller
    if (request.method === 'OPTIONS') {
      return true
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    const rawToken = this.sessionTokenService.extractBearerToken(request.headers.authorization)

    if (!rawToken) {
      throw new AppException(AUTH_ERRORS.SESSION_TOKEN_MISSING)
    }

    const tokenDigest = this.sessionTokenService.digest(rawToken)
    const auth = await this.sessionStoreService.validateAndTouch(tokenDigest)

    if (!auth) {
      throw new AppException(AUTH_ERRORS.SESSION_INVALID)
    }
    request.auth = auth
    return true
  }
}
