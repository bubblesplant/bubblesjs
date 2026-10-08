import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, ids } from '@/modules/access/access-http'
import { parse } from '@/modules/access/access.validation'
import { accountStatusSchema, listSchema, platformRolesSchema } from './accounts.validation'
import { AccountsService } from './accounts.service'
import { AccountPasswordResetService } from './password-reset/password-reset.service'
import { resetAccountPasswordSchema } from './password-reset/reset-password.validation'
import { markPasswordTargetResolved } from '@/common/security/password-security-event'

@Controller()
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly passwordReset: AccountPasswordResetService,
  ) {}
  /** 校验分页及状态筛选参数，读取平台账号列表。 */
  @Get('platform/accounts')
  @AccessPolicy({ scope: 'platform', permission: 'platform.accounts.read' })
  accounts(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.accountsService.accounts({ actor: actor(req), query: parse(listSchema, query) })
  }
  /** 校验账号标识与目标状态，提交平台账号启停操作。 */
  @Patch('platform/accounts/:userId/status')
  @AccessPolicy({ scope: 'platform', permission: 'platform.accounts.status' })
  accountStatus(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.accountsService.accountChange({
      actor: actor(req),
      userId: ids(req).userId!,
      body: parse(accountStatusSchema, body),
    })
  }
  /** 校验账号标识与角色集合，替换账号的平台角色。 */
  @Put('platform/accounts/:userId/roles')
  @AccessPolicy({ scope: 'platform', permission: 'platform.accounts.roles' })
  accountRoles(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.accountsService.accountChange({
      actor: actor(req),
      userId: ids(req).userId!,
      body: parse(platformRolesSchema, body),
    })
  }

  /** 校验平台管理员身份与目标账号，提交重置密码操作。 */
  @Post('platform/accounts/:userId/reset-password')
  @HttpCode(HttpStatus.OK)
  @AccessPolicy({
    scope: 'platform',
    permission: 'platform.accounts.reset-password',
    adminOnly: true,
  })
  resetPassword(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.passwordReset.resetPassword({
      actor: actor(req),
      userId: ids(req).userId!,
      body: parse(resetAccountPasswordSchema, body),
      onTargetResolved: (targetUserId) => markPasswordTargetResolved(req, targetUserId),
    })
  }
}
