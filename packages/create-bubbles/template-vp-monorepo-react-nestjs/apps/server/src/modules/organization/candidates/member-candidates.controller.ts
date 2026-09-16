import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, scopeFor } from '@/modules/access/access-http'
import { parse } from '@/modules/access/access.validation'
import type { OrganizationScope } from 'shared/types'
import {
  organizationMemberCandidateQuerySchema,
  resolveOrganizationMemberCandidatesSchema,
} from '../organization.validation'
import { MemberCandidatesService } from './member-candidates.service'

@Controller()
export class MemberCandidatesController {
  constructor(private readonly candidates: MemberCandidatesService) {}

  /** 按动态 purpose 权限分页搜索企业成员及获准项目身份。 */
  @Get('companies/:companyId/organization/member-candidates')
  @AccessPolicy({ scope: 'route' })
  searchCompany(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.candidates.search({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      query: parse(organizationMemberCandidateQuerySchema, query),
    })
  }

  /** 按动态 purpose 权限分页搜索当前项目成员身份。 */
  @Get('companies/:companyId/projects/:projectId/organization/member-candidates')
  @AccessPolicy({ scope: 'route' })
  searchProject(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.candidates.search({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      query: parse(organizationMemberCandidateQuerySchema, query),
    })
  }

  /** 按请求 userId 顺序回显企业候选，未知或越权用户不返回占位。 */
  @Post('companies/:companyId/organization/member-candidates/resolve')
  @AccessPolicy({ scope: 'route' })
  resolveCompany(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.candidates.resolve({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      body: parse(resolveOrganizationMemberCandidatesSchema, body),
    })
  }

  /** 按请求 userId 顺序回显项目候选，未知或越权用户不返回占位。 */
  @Post('companies/:companyId/projects/:projectId/organization/member-candidates/resolve')
  @AccessPolicy({ scope: 'route' })
  resolveProject(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.candidates.resolve({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      body: parse(resolveOrganizationMemberCandidatesSchema, body),
    })
  }
}
