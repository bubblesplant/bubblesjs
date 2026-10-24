import { Body, Controller, Get, Patch, Post, Put, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, ids } from '@/modules/access/access-http'
import { parse } from '@/modules/access/access.validation'
import {
  createOrganizationTemplateSchema,
  organizationTemplateListQuerySchema,
  replaceOrganizationTemplateSchema,
  updateOrganizationTemplateStatusSchema,
} from '../organization.validation'
import { OrganizationTemplatesService } from './organization-templates.service'

@ApiTags('项目组织模板')
@Controller()
export class OrganizationTemplatesController {
  constructor(private readonly templates: OrganizationTemplatesService) {}

  /** 分页读取企业组织模板摘要，不返回完整模板定义。 */
  @Get('companies/:companyId/organization/templates')
  @ApiOperation({ summary: '分页查询企业的项目组织模板' })
  @AccessPolicy({ scope: 'company', permission: 'company.organization.templates.read' })
  list(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.templates.list({
      actor: actor(req),
      companyId: ids(req).companyId!,
      query: parse(organizationTemplateListQuerySchema, query),
    })
  }

  /** 读取企业组织模板当前版本的完整定义。 */
  @Get('companies/:companyId/organization/templates/:templateId')
  @ApiOperation({ summary: '查询企业的项目组织模板详情' })
  @AccessPolicy({ scope: 'company', permission: 'company.organization.templates.read' })
  get(@Req() req: FastifyRequest) {
    const routeIds = ids(req)
    return this.templates.get({
      actor: actor(req),
      companyId: routeIds.companyId!,
      templateId: routeIds.templateId!,
    })
  }

  /** 创建企业组织模板及首个完整子项快照。 */
  @Post('companies/:companyId/organization/templates')
  @ApiOperation({ summary: '创建企业的项目组织模板' })
  @AccessPolicy({ scope: 'company', permission: 'company.organization.templates.create' })
  create(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.templates.create({
      actor: actor(req),
      companyId: ids(req).companyId!,
      body: parse(createOrganizationTemplateSchema, body),
    })
  }

  /** 完整替换企业组织模板并生成下一版本子项快照。 */
  @Put('companies/:companyId/organization/templates/:templateId')
  @ApiOperation({ summary: '全量替换企业的项目组织模板' })
  @AccessPolicy({ scope: 'company', permission: 'company.organization.templates.update' })
  replace(@Req() req: FastifyRequest, @Body() body: unknown) {
    const routeIds = ids(req)
    return this.templates.replace({
      actor: actor(req),
      companyId: routeIds.companyId!,
      templateId: routeIds.templateId!,
      body: parse(replaceOrganizationTemplateSchema, body),
    })
  }

  /** 变更企业组织模板状态或默认标记，并复制完整子项快照。 */
  @Patch('companies/:companyId/organization/templates/:templateId/status')
  @ApiOperation({ summary: '更新企业的项目组织模板状态或默认标记' })
  @AccessPolicy({ scope: 'company', permission: 'company.organization.templates.update' })
  status(@Req() req: FastifyRequest, @Body() body: unknown) {
    const routeIds = ids(req)
    return this.templates.status({
      actor: actor(req),
      companyId: routeIds.companyId!,
      templateId: routeIds.templateId!,
      body: parse(updateOrganizationTemplateStatusSchema, body),
    })
  }
}
