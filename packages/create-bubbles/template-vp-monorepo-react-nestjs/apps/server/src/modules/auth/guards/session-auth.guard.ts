import { IS_PUBLIC_KEY } from '@/common/constants/auth.constants'
import { AppException } from '@/common/exceptions/app.exception'
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AUTH_ERRORS } from '../auth.errors'
import { SessionStoreService } from '../session/session-store.service'
import { SessionTokenService } from '../session/session-token.service'
import { AuthenticatedRequest } from '../session/session.types'
import { AuthRepository } from '../auth.repository'

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionTokenService: SessionTokenService,
    private readonly sessionStoreService: SessionStoreService,
    private readonly authRepository: AuthRepository,
  ) {}

  /**
   * 放行预检和公开路由，否则校验 Bearer 会话及用户状态，并将身份写入 request.auth。
   * @throws 令牌缺失、会话失效或用户停用时抛出相应认证错误。
   */
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
    const user = await this.authRepository.findPublicById(auth.userId)
    if (!user || user.status !== 'active') throw new AppException(AUTH_ERRORS.SESSION_INVALID)
    request.auth = auth
    return true
  }
}
