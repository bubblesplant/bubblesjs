import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, ids } from '@/modules/access/access-http'
import { parse } from '@/modules/access/access.validation'
import { MemberInvitationsService } from './member-invitations.service'
import {
  companyMemberInvitationQuerySchema,
  createCompanyMemberInvitationSchema,
  resendCompanyMemberInvitationSchema,
  revokeCompanyMemberInvitationSchema,
} from './member-invitations.validation'

@Controller('companies/:companyId/member-invitations')
export class CompanyMemberInvitationsController {
  constructor(private readonly invitations: MemberInvitationsService) {}

  /** 分页查询当前企业邀请，过期状态按查询时刻派生且不会返回任何 token 信息。 */
  @Get()
  @AccessPolicy({ scope: 'company', permission: 'company.members.add' })
  list(@Req() request: FastifyRequest, @Query() query: unknown) {
    const { companyId } = ids(request)
    return this.invitations.list({
      actor: actor(request),
      scope: { type: 'company', companyId: companyId! },
      query: parse(companyMemberInvitationQuerySchema, query),
    })
  }

  /** 创建 7 天有效的一次性邀请，原始 token 只在本次响应返回。 */
  @Post()
  @AccessPolicy({ scope: 'company', permission: 'company.members.add' })
  create(@Req() request: FastifyRequest, @Body() body: unknown) {
    const { companyId } = ids(request)
    return this.invitations.create({
      actor: actor(request),
      scope: { type: 'company', companyId: companyId! },
      body: parse(createCompanyMemberInvitationSchema, body),
    })
  }

  /** 撤销邀请并使其 token 永久不可接受。 */
  @Post(':invitationId/revoke')
  @HttpCode(HttpStatus.OK)
  @AccessPolicy({ scope: 'company', permission: 'company.members.add' })
  revoke(@Req() request: FastifyRequest, @Body() body: unknown) {
    const { companyId, invitationId } = ids(request)
    return this.invitations.revoke({
      actor: actor(request),
      scope: { type: 'company', companyId: companyId! },
      invitationId: invitationId!,
      body: parse(revokeCompanyMemberInvitationSchema, body),
    })
  }

  /** 轮换邀请 token 并从重发时刻重新计算 7 天有效期。 */
  @Post(':invitationId/resend')
  @HttpCode(HttpStatus.OK)
  @AccessPolicy({ scope: 'company', permission: 'company.members.add' })
  resend(@Req() request: FastifyRequest, @Body() body: unknown) {
    const { companyId, invitationId } = ids(request)
    return this.invitations.resend({
      actor: actor(request),
      scope: { type: 'company', companyId: companyId! },
      invitationId: invitationId!,
      body: parse(resendCompanyMemberInvitationSchema, body),
    })
  }
}
