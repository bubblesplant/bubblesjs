import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import {
  ACCESS_POLICY_KEY,
  type AccessPolicyDefinition,
} from '@/common/decorators/access-policy.decorator'
import { IS_PUBLIC_KEY } from '@/common/constants/auth.constants'
import { AppException } from '@/common/exceptions/app.exception'
import { ACCESS_ERRORS } from './access.errors'
import { AccessService } from './access.service'
import { actor, ids, scopeFor } from './access-http'
import type { AccessScope } from 'shared/types'

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}
  /**
   * 读取路由访问策略并验证当前作用域权限；公开接口和预检请求直接放行。
   *
   * 仅要求登录的策略交由认证守卫处理，其余策略在只读事务中重新验证权限。
   * 未声明访问策略的受保护接口默认拒绝访问。
   * @returns 权限校验通过时返回 true，否则抛出对应业务异常。
   */
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    if (
      request.method === 'OPTIONS' ||
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true
    const policy = this.reflector.getAllAndOverride<AccessPolicyDefinition>(ACCESS_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!policy) throw new AppException(ACCESS_ERRORS.FORBIDDEN)
    if (policy.scope === 'authenticated') return true
    const params = ids(request)
    const scope: AccessScope =
      policy.scope === 'route'
        ? scopeFor(request)
        : policy.scope === 'platform'
          ? { type: 'platform' }
          : policy.scope === 'company'
            ? { type: 'company', companyId: params.companyId! }
            : { type: 'project', companyId: params.companyId!, projectId: params.projectId! }
    const permission =
      typeof policy.permission === 'string'
        ? policy.permission.replace('{scope}', scope.type)
        : policy.permission?.map((p) => p.replace('{scope}', scope.type))
    await this.access.read(
      { actor: actor(request), scope, permission, adminOnly: policy.adminOnly },
      async () => undefined,
    )
    return true
  }
}
