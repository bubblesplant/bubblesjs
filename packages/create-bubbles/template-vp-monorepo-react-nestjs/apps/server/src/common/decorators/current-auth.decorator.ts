import { AuthenticatedRequest, CurrentAuthType } from '@/modules/auth/session/session.types'
import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentAuthType => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    if (!request.auth) {
      throw new UnauthorizedException('登录状态不存在')
    }

    return request.auth
  },
)
