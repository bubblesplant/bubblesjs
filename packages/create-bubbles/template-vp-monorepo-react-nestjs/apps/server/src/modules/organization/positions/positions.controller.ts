import { Body, Controller, Get, Patch, Post, Put, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, ids, scopeFor } from '@/modules/access/access-http'
import { parse } from '@/modules/access/access.validation'
import type { OrganizationScope } from 'shared/types'
import {
  createPositionSchema,
  positionListQuerySchema,
  replaceMemberPositionsSchema,
  replacePositionMembersSchema,
  statusRequestSchema,
  updatePositionSchema,
} from '../organization.validation'
import { PositionsService } from './positions.service'

@Controller()
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  /** 分页读取企业岗位。 */
  @Get('companies/:companyId/positions')
  @AccessPolicy({ scope: 'company', permission: 'company.positions.read' })
  companyPositions(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.positions.list({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      query: parse(positionListQuerySchema, query),
    })
  }

  /** 分页读取项目岗位。 */
  @Get('companies/:companyId/projects/:projectId/positions')
  @AccessPolicy({ scope: 'project', permission: 'project.positions.read' })
  projectPositions(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.positions.list({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      query: parse(positionListQuerySchema, query),
    })
  }

  /** 创建企业岗位。 */
  @Post('companies/:companyId/positions')
  @AccessPolicy({ scope: 'company', permission: 'company.positions.create' })
  createCompanyPosition(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.create({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      body: parse(createPositionSchema, body),
    })
  }

  /** 创建项目岗位。 */
  @Post('companies/:companyId/projects/:projectId/positions')
  @AccessPolicy({ scope: 'project', permission: 'project.positions.create' })
  createProjectPosition(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.create({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      body: parse(createPositionSchema, body),
    })
  }

  /** 更新企业岗位资料。 */
  @Patch('companies/:companyId/positions/:positionId')
  @AccessPolicy({ scope: 'company', permission: 'company.positions.update' })
  updateCompanyPosition(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.update({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      positionId: ids(req).positionId!,
      body: parse(updatePositionSchema, body),
    })
  }

  /** 更新项目岗位资料。 */
  @Patch('companies/:companyId/projects/:projectId/positions/:positionId')
  @AccessPolicy({ scope: 'project', permission: 'project.positions.update' })
  updateProjectPosition(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.update({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      positionId: ids(req).positionId!,
      body: parse(updatePositionSchema, body),
    })
  }

  /** 启停企业岗位并保留现有任职。 */
  @Patch('companies/:companyId/positions/:positionId/status')
  @AccessPolicy({ scope: 'company', permission: 'company.positions.update' })
  companyPositionStatus(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.status({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      positionId: ids(req).positionId!,
      body: parse(statusRequestSchema, body),
    })
  }

  /** 启停项目岗位并保留现有任职。 */
  @Patch('companies/:companyId/projects/:projectId/positions/:positionId/status')
  @AccessPolicy({ scope: 'project', permission: 'project.positions.update' })
  projectPositionStatus(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.status({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      positionId: ids(req).positionId!,
      body: parse(statusRequestSchema, body),
    })
  }

  /** 按企业成员全量替换岗位任职。 */
  @Put('companies/:companyId/organization/members/:userId/positions')
  @AccessPolicy({ scope: 'company', permission: 'company.positions.assign' })
  replaceCompanyMemberPositions(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.replaceMemberPositions({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      userId: ids(req).userId!,
      body: parse(replaceMemberPositionsSchema, body),
    })
  }

  /** 按项目成员全量替换岗位任职。 */
  @Put('companies/:companyId/projects/:projectId/organization/members/:userId/positions')
  @AccessPolicy({ scope: 'project', permission: 'project.positions.assign' })
  replaceProjectMemberPositions(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.replaceMemberPositions({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      userId: ids(req).userId!,
      body: parse(replaceMemberPositionsSchema, body),
    })
  }

  /** 按企业岗位全量替换成员集合。 */
  @Put('companies/:companyId/positions/:positionId/members')
  @AccessPolicy({ scope: 'company', permission: 'company.positions.assign' })
  replaceCompanyPositionMembers(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.replacePositionMembers({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      positionId: ids(req).positionId!,
      body: parse(replacePositionMembersSchema, body),
    })
  }

  /** 按项目岗位全量替换成员集合。 */
  @Put('companies/:companyId/projects/:projectId/positions/:positionId/members')
  @AccessPolicy({ scope: 'project', permission: 'project.positions.assign' })
  replaceProjectPositionMembers(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.positions.replacePositionMembers({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      positionId: ids(req).positionId!,
      body: parse(replacePositionMembersSchema, body),
    })
  }
}
