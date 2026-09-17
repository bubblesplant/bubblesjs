import { Body, Controller, Delete, Get, Patch, Post, Put, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { AppException } from '@/common/exceptions/app.exception'
import { MembersService } from './members.service'
import { actor, ids, scopeFor } from '@/modules/access/access-http'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import {
  deleteSchema,
  entityListSchema,
  parse,
  statusSchema,
} from '@/modules/access/access.validation'
import {
  memberRolesSchema,
  projectMemberSchema,
  registerCompanyMemberSchema,
} from './members.validation'

@Controller(['companies/:companyId/members', 'companies/:companyId/projects/:projectId/members'])
export class MembersController {
  constructor(private readonly members: MembersService) {}
  /** 校验分页与筛选参数，查询路由对应公司或项目的成员列表。 */
  @Get()
  @AccessPolicy({ scope: 'route', permission: '{scope}.members.read' })
  list(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.members.list({
      actor: actor(req),
      scope: scopeFor(req),
      query: parse(entityListSchema, query),
    })
  }
  /** 企业直接注册新账号并加入成员，项目按稳定 userId 添加所属企业成员。 */
  @Post()
  @AccessPolicy({ scope: 'route', permission: '{scope}.members.add' })
  add(@Req() req: FastifyRequest, @Body() body: unknown) {
    const scope = scopeFor(req)
    if (scope.type === 'project')
      return this.members.addProjectMember({
        actor: actor(req),
        scope,
        body: parse(projectMemberSchema, body),
      })
    if (scope.type === 'company')
      return this.members.registerCompanyMember({
        actor: actor(req),
        scope,
        body: parse(registerCompanyMemberSchema, body),
      })
    throw new AppException(ACCESS_ERRORS.NOT_FOUND)
  }
  /** 校验成员标识、预期版本及目标状态，提交当前作用域的成员启停操作。 */
  @Patch(':memberId/status')
  @AccessPolicy({ scope: 'route', permission: '{scope}.members.status' })
  status(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.members.change({
      actor: actor(req),
      scope: scopeFor(req),
      memberId: ids(req).memberId!,
      action: 'status',
      body: parse(statusSchema, body),
    })
  }
  /** 校验成员标识、预期版本和角色集合，替换当前作用域的成员角色。 */
  @Put(':memberId/roles')
  @AccessPolicy({ scope: 'route', permission: '{scope}.members.roles' })
  roles(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.members.change({
      actor: actor(req),
      scope: scopeFor(req),
      memberId: ids(req).memberId!,
      action: 'roles',
      body: parse(memberRolesSchema, body),
    })
  }
  /** 校验成员标识和预期版本，移除当前公司或项目的成员关系。 */
  @Delete(':memberId')
  @AccessPolicy({ scope: 'route', permission: '{scope}.members.remove' })
  remove(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.members.change({
      actor: actor(req),
      scope: scopeFor(req),
      memberId: ids(req).memberId!,
      action: 'remove',
      body: parse(deleteSchema, query),
    })
  }
}
