import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { Authenticated } from '@/common/decorators/access-policy.decorator'
import { actor } from '@/modules/access/access-http'
import { parse } from '@/modules/access/access.validation'
import { MemberInvitationsService } from './member-invitations.service'
import { acceptCompanyMemberInvitationSchema } from './member-invitations.validation'

@Controller('company-member-invitations')
export class MemberInvitationAcceptanceController {
  constructor(private readonly invitations: MemberInvitationsService) {}

  /** 由当前登录账号接受一次性邀请，并在成功后建立企业成员及默认角色。 */
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @Authenticated()
  accept(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.invitations.accept({
      actor: actor(request),
      body: parse(acceptCompanyMemberInvitationSchema, body),
    })
  }
}
