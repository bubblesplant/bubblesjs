import { Body, Controller, Get, HttpCode, Patch, Post, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, ids } from '@/modules/access/access-http'
import { entityListSchema, parse, statusSchema } from '@/modules/access/access.validation'
import {
  createProjectSchema,
  profileSchema,
} from '@/modules/access/workspaces/workspaces.validation'
import { administratorSchema } from '@/modules/members/administrators/administrators.validation'
import { ProjectsService } from './projects.service'

@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}
  /** 校验公司、项目标识和资料字段，提交项目资料更新及预期版本。 */
  @Patch('companies/:companyId/projects/:projectId')
  @AccessPolicy({ scope: 'route', permission: '{scope}.profile.update' })
  updateProfile(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.projectsService.profile({
      actor: actor(req),
      companyId: ids(req).companyId!,
      projectId: ids(req).projectId!,
      body: parse(profileSchema, body),
    })
  }
  /** 校验公司标识与分页筛选参数，读取当前用户可查询的公司项目列表。 */
  @Get('companies/:companyId/projects')
  @AccessPolicy({ scope: 'company', permission: 'company.projects.read' })
  projects(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.projectsService.listProjects({
      actor: actor(req),
      companyId: ids(req).companyId!,
      query: parse(entityListSchema, query),
    })
  }
  /** 校验公司标识、项目资料和初始管理员 userId，提交公司管理员创建项目操作。 */
  @Post('companies/:companyId/projects')
  @AccessPolicy({ scope: 'company', permission: 'company.projects.create', adminOnly: true })
  createProject(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.projectsService.create({
      actor: actor(req),
      companyId: ids(req).companyId!,
      body: parse(createProjectSchema, body),
    })
  }
  /** 校验公司和项目标识，读取项目资料及管理员详情。 */
  @Get('companies/:companyId/projects/:projectId')
  @AccessPolicy({ scope: 'project', permission: 'project.profile.read' })
  projectDetail(@Req() req: FastifyRequest) {
    const params = ids(req)
    return this.projectsService.get({
      actor: actor(req),
      companyId: params.companyId!,
      projectId: params.projectId!,
    })
  }
  /** 校验公司、项目标识及预期版本，提交公司权限下的项目启停操作。 */
  @Patch('companies/:companyId/projects/:projectId/status')
  @AccessPolicy({ scope: 'company', permission: 'company.projects.status' })
  projectStatus(@Req() req: FastifyRequest, @Body() body: unknown) {
    const params = ids(req)
    return this.projectsService.status({
      actor: actor(req),
      companyId: params.companyId!,
      projectId: params.projectId!,
      body: parse(statusSchema, body),
    })
  }
  /** 校验公司、项目标识及管理员 userId，提交追加或替换项目管理员操作。 */
  @Post('companies/:companyId/projects/:projectId/administrator')
  @HttpCode(200)
  @AccessPolicy({ scope: 'company', permission: 'company.projects.administrator', adminOnly: true })
  projectAdministrator(@Req() req: FastifyRequest, @Body() body: unknown) {
    const params = ids(req)
    return this.projectsService.setAdministrator({
      actor: actor(req),
      companyId: params.companyId!,
      projectId: params.projectId!,
      body: parse(administratorSchema, body),
    })
  }
  /** 校验公司和项目标识，返回公司管理员可管理的项目管理员列表。 */
  @Get('companies/:companyId/projects/:projectId/administrators')
  @AccessPolicy({ scope: 'company', permission: 'company.projects.administrator', adminOnly: true })
  projectAdministrators(@Req() req: FastifyRequest) {
    const params = ids(req)
    return this.projectsService.projectAdministrators({
      actor: actor(req),
      companyId: params.companyId!,
      projectId: params.projectId!,
    })
  }
}
