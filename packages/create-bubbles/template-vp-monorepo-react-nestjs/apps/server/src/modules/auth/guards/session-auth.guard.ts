import { IS_PUBLIC_KEY } from '@/common/constants/auth'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
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
      throw new UnauthorizedException({
        code: 'SESSION_TOKEN_MISSING',
        message: '缺少有效的登录 Token',
      })
    }

    const tokenDigest = this.sessionTokenService.digest(rawToken)
    const auth = await this.sessionStoreService.validateAndTouch(tokenDigest)

    if (!auth) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: '登录已失效，请重新登录',
      })
    }
    request.auth = auth
    return true
  }
}
