import { Body, Controller, Get, HttpCode, Patch, Post, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, ids } from '@/modules/access/access-http'
import { entityListSchema, parse, statusSchema } from '@/modules/access/access.validation'
import {
  createCompanySchema,
  profileSchema,
} from '@/modules/access/workspaces/workspaces.validation'
import { administratorSchema } from '@/modules/members/administrators/administrators.validation'
import { updateCompanyHierarchySchema } from 'shared/utils'
import { CompaniesService } from './companies.service'

@Controller()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}
  /** 校验分页筛选参数，从平台入口查询公司列表。 */
  @Get('platform/companies')
  @AccessPolicy({ scope: 'platform', permission: 'platform.companies.read' })
  companies(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.companiesService.listCompanies({
      actor: actor(req),
      query: parse(entityListSchema, query),
    })
  }
  /** 返回平台当前可见企业的完整父子层级树，并按同级排序稳定组装。 */
  @Get('platform/companies/tree')
  @AccessPolicy({ scope: 'platform', permission: 'platform.companies.read' })
  companyTree(@Req() req: FastifyRequest) {
    return this.companiesService.hierarchyTree({ actor: actor(req) })
  }
  /** 校验公司标识，从平台入口读取公司资料及管理员详情。 */
  @Get('platform/companies/:companyId')
  @AccessPolicy({ scope: 'platform', permission: 'platform.companies.read' })
  companyDetail(@Req() req: FastifyRequest) {
    return this.companiesService.get({
      actor: actor(req),
      companyId: ids(req).companyId!,
      platform: true,
    })
  }
  /** 校验公司资料、层级字段和初始管理员 userId，提交平台管理员创建公司操作。 */
  @Post('platform/companies')
  @AccessPolicy({ scope: 'platform', permission: 'platform.companies.create', adminOnly: true })
  createCompany(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.companiesService.create({
      actor: actor(req),
      body: parse(createCompanySchema, body),
    })
  }
  /** 校验公司标识、预期版本及状态，提交平台侧公司启停操作。 */
  @Patch('platform/companies/:companyId/status')
  @AccessPolicy({ scope: 'platform', permission: 'platform.companies.status' })
  companyStatus(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.companiesService.status({
      actor: actor(req),
      companyId: ids(req).companyId!,
      body: parse(statusSchema, body),
    })
  }
  /** 校验目标父企业、循环、同级名称和版本后调整企业层级资料。 */
  @Patch('platform/companies/:companyId/hierarchy')
  @AccessPolicy({
    scope: 'platform',
    permission: 'platform.companies.hierarchy',
  })
  companyHierarchy(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.companiesService.updateHierarchy({
      actor: actor(req),
      companyId: ids(req).companyId!,
      body: parse(updateCompanyHierarchySchema, body),
    })
  }
  /** 校验公司标识及管理员 userId，提交平台管理员追加或替换公司管理员操作。 */
  @Post('platform/companies/:companyId/administrator')
  @HttpCode(200)
  @AccessPolicy({
    scope: 'platform',
    permission: 'platform.companies.administrator',
    adminOnly: true,
  })
  companyAdministrator(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.companiesService.setAdministrator({
      actor: actor(req),
      companyId: ids(req).companyId!,
      body: parse(administratorSchema, body),
    })
  }
  /** 校验公司标识，在公司作用域中读取当前公司资料和管理员详情。 */
  @Get('companies/:companyId')
  @AccessPolicy({ scope: 'company', permission: 'company.profile.read' })
  profile(@Req() req: FastifyRequest) {
    return this.companiesService.get({ actor: actor(req), companyId: ids(req).companyId! })
  }
  /** 校验公司标识、预期版本与资料字段，提交当前公司的资料更新。 */
  @Patch('companies/:companyId')
  @AccessPolicy({ scope: 'route', permission: '{scope}.profile.update' })
  updateProfile(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.companiesService.profile({
      actor: actor(req),
      companyId: ids(req).companyId!,
      body: parse(profileSchema, body),
    })
  }
}
