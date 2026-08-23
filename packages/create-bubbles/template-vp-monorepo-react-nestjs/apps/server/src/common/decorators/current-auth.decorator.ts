import { AUTH_ERRORS } from '@/modules/auth/auth.errors'
import { AuthenticatedRequest, CurrentAuthType } from '@/modules/auth/session/session.types'
import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { AppException } from '../exceptions/app.exception'

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentAuthType => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    if (!request.auth) {
      throw new AppException(AUTH_ERRORS.CONTEXT_MISSING)
    }

    return request.auth
  },
)
