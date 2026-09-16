import { Body, Controller, Get, HttpCode, Patch, Post, Put, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, ids, scopeFor } from '@/modules/access/access-http'
import { parse } from '@/modules/access/access.validation'
import type { OrganizationScope } from 'shared/types'
import {
  createOrganizationUnitSchema,
  moveOrganizationUnitSchema,
  organizationTreeQuerySchema,
  replaceMemberOrganizationUnitsSchema,
  replaceOrganizationUnitMembersSchema,
  statusRequestSchema,
  updateOrganizationUnitSchema,
} from '../organization.validation'
import { OrganizationUnitsService } from './organization-units.service'

@Controller()
export class OrganizationUnitsController {
  constructor(private readonly units: OrganizationUnitsService) {}

  /** 从企业路由懒加载一层组织树。 */
  @Get('companies/:companyId/organization/tree')
  @AccessPolicy({ scope: 'company', permission: 'company.organization.read' })
  companyTree(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.units.treeView({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      query: parse(organizationTreeQuerySchema, query),
    })
  }

  /** 从项目路由懒加载一层组织树。 */
  @Get('companies/:companyId/projects/:projectId/organization/tree')
  @AccessPolicy({ scope: 'project', permission: 'project.organization.read' })
  projectTree(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.units.treeView({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      query: parse(organizationTreeQuerySchema, query),
    })
  }

  /** 在企业组织树中新建单元。 */
  @Post('companies/:companyId/organization/units')
  @AccessPolicy({ scope: 'company', permission: 'company.organization.create' })
  createCompanyUnit(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.create({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      body: parse(createOrganizationUnitSchema, body),
    })
  }

  /** 在项目组织树中新建单元。 */
  @Post('companies/:companyId/projects/:projectId/organization/units')
  @AccessPolicy({ scope: 'project', permission: 'project.organization.create' })
  createProjectUnit(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.create({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      body: parse(createOrganizationUnitSchema, body),
    })
  }

  /** 修改企业组织单元资料或排序。 */
  @Patch('companies/:companyId/organization/units/:unitId')
  @AccessPolicy({ scope: 'company', permission: 'company.organization.update' })
  updateCompanyUnit(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.update({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      unitId: ids(req).unitId!,
      body: parse(updateOrganizationUnitSchema, body),
    })
  }

  /** 修改项目组织单元资料或排序。 */
  @Patch('companies/:companyId/projects/:projectId/organization/units/:unitId')
  @AccessPolicy({ scope: 'project', permission: 'project.organization.update' })
  updateProjectUnit(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.update({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      unitId: ids(req).unitId!,
      body: parse(updateOrganizationUnitSchema, body),
    })
  }

  /** 在企业组织树内移动单元并保持稳定 ID。 */
  @Post('companies/:companyId/organization/units/:unitId/move')
  @HttpCode(200)
  @AccessPolicy({ scope: 'company', permission: 'company.organization.move' })
  moveCompanyUnit(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.move({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      unitId: ids(req).unitId!,
      body: parse(moveOrganizationUnitSchema, body),
    })
  }

  /** 在项目组织树内移动单元并保持稳定 ID。 */
  @Post('companies/:companyId/projects/:projectId/organization/units/:unitId/move')
  @HttpCode(200)
  @AccessPolicy({ scope: 'project', permission: 'project.organization.move' })
  moveProjectUnit(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.move({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      unitId: ids(req).unitId!,
      body: parse(moveOrganizationUnitSchema, body),
    })
  }

  /** 启停企业组织单元，保留后代状态和成员关系。 */
  @Patch('companies/:companyId/organization/units/:unitId/status')
  @AccessPolicy({ scope: 'company', permission: 'company.organization.update' })
  companyUnitStatus(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.status({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      unitId: ids(req).unitId!,
      body: parse(statusRequestSchema, body),
    })
  }

  /** 启停项目组织单元，保留后代状态和成员关系。 */
  @Patch('companies/:companyId/projects/:projectId/organization/units/:unitId/status')
  @AccessPolicy({ scope: 'project', permission: 'project.organization.update' })
  projectUnitStatus(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.status({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      unitId: ids(req).unitId!,
      body: parse(statusRequestSchema, body),
    })
  }

  /** 按企业成员全量替换组织关系。 */
  @Put('companies/:companyId/organization/members/:userId/units')
  @AccessPolicy({ scope: 'company', permission: 'company.organization.assign' })
  replaceCompanyMemberUnits(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.replaceMemberUnits({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      userId: ids(req).userId!,
      body: parse(replaceMemberOrganizationUnitsSchema, body),
    })
  }

  /** 按项目成员全量替换组织关系。 */
  @Put('companies/:companyId/projects/:projectId/organization/members/:userId/units')
  @AccessPolicy({ scope: 'project', permission: 'project.organization.assign' })
  replaceProjectMemberUnits(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.replaceMemberUnits({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      userId: ids(req).userId!,
      body: parse(replaceMemberOrganizationUnitsSchema, body),
    })
  }

  /** 按企业组织单元全量替换成员集合。 */
  @Put('companies/:companyId/organization/units/:unitId/members')
  @AccessPolicy({ scope: 'company', permission: 'company.organization.assign' })
  replaceCompanyUnitMembers(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.replaceUnitMembers({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      unitId: ids(req).unitId!,
      body: parse(replaceOrganizationUnitMembersSchema, body),
    })
  }

  /** 按项目组织单元全量替换成员集合。 */
  @Put('companies/:companyId/projects/:projectId/organization/units/:unitId/members')
  @AccessPolicy({ scope: 'project', permission: 'project.organization.assign' })
  replaceProjectUnitMembers(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.units.replaceUnitMembers({
      actor: actor(req),
      scope: scopeFor(req) as OrganizationScope,
      unitId: ids(req).unitId!,
      body: parse(replaceOrganizationUnitMembersSchema, body),
    })
  }
}
