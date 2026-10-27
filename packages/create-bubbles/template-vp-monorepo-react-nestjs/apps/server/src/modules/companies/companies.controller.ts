import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  SerializeOptions,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import type { CompanyDetail, PageResult } from 'shared/types'
import { SWAGGER_SESSION_AUTH } from '@/common/constants/swagger.constants'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, ids } from '@/modules/access/access-http'
import { entityListSchema, parse, statusSchema } from '@/modules/access/access.validation'
import {
  createCompanySchema,
  profileSchema,
} from '@/modules/access/workspaces/workspaces.validation'
import { administratorSchema } from '@/modules/members/administrators/administrators.validation'
import { CompaniesService } from './companies.service'
import { companyPageResponseSchema } from './companies.response'

@ApiTags('企业管理')
@Controller()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}
  /** 校验分页筛选参数，从平台入口查询公司及当前管理员并序列化公开字段。 */
  @ApiOperation({ summary: '获取平台企业列表' })
  @ApiBearerAuth(SWAGGER_SESSION_AUTH)
  @ApiOkResponse({ standardSchema: companyPageResponseSchema })
  @SerializeOptions({ schema: companyPageResponseSchema })
  @Get('platform/companies')
  @AccessPolicy({ scope: 'platform', permission: 'platform.companies.read' })
  companies(
    @Req() req: FastifyRequest,
    @Query() query: unknown,
  ): Promise<PageResult<CompanyDetail>> {
    return this.companiesService.listCompanies({
      actor: actor(req),
      query: parse(entityListSchema, query),
    })
  }
  /** 校验公司标识，从平台入口读取公司资料及管理员详情。 */
  @ApiOperation({ summary: '获取平台企业详情' })
  @Get('platform/companies/:companyId')
  @AccessPolicy({ scope: 'platform', permission: 'platform.companies.read' })
  companyDetail(@Req() req: FastifyRequest) {
    return this.companiesService.get({
      actor: actor(req),
      companyId: ids(req).companyId!,
      platform: true,
    })
  }
  /** 校验公司资料和初始管理员 userId，提交平台管理员创建公司操作。 */
  @ApiOperation({ summary: '创建企业' })
  @Post('platform/companies')
  @AccessPolicy({ scope: 'platform', permission: 'platform.companies.create', adminOnly: true })
  createCompany(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.companiesService.create({
      actor: actor(req),
      body: parse(createCompanySchema, body),
    })
  }
  /** 校验公司标识、预期版本及状态，提交平台侧公司启停操作。 */
  @ApiOperation({ summary: '启用或停用企业' })
  @Patch('platform/companies/:companyId/status')
  @AccessPolicy({ scope: 'platform', permission: 'platform.companies.status' })
  companyStatus(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.companiesService.status({
      actor: actor(req),
      companyId: ids(req).companyId!,
      body: parse(statusSchema, body),
    })
  }
  /** 校验公司标识及管理员 userId，提交平台管理员追加或替换公司管理员操作。 */
  @ApiOperation({ summary: '设置企业管理员' })
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
  @ApiOperation({ summary: '获取当前企业资料' })
  @Get('companies/:companyId')
  @AccessPolicy({ scope: 'company', permission: 'company.profile.read' })
  profile(@Req() req: FastifyRequest) {
    return this.companiesService.get({ actor: actor(req), companyId: ids(req).companyId! })
  }
  /** 校验公司标识、预期版本与资料字段，提交当前公司的资料更新。 */
  @ApiOperation({ summary: '更新当前企业资料' })
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
