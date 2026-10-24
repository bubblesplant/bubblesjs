import { Body, Controller, Delete, Get, Patch, Post, Put, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { RolesService } from './roles.service'
import { actor, ids, scopeFor } from '../access-http'
import { deleteSchema, pageSchema, parse } from '../access.validation'
import { createRoleSchema, permissionsSchema, updateRoleSchema } from './roles.validation'

@ApiTags('角色管理')
@Controller(['platform', 'companies/:companyId', 'companies/:companyId/projects/:projectId'])
export class RolesController {
  constructor(private readonly roles: RolesService) {}
  /** 校验分页查询参数，按路由作用域返回可读取的角色列表。 */
  @ApiOperation({ summary: '获取角色列表' })
  @Get('roles')
  @AccessPolicy({ scope: 'route' })
  list(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.roles.list({
      actor: actor(req),
      scope: scopeFor(req),
      query: parse(pageSchema, query),
    })
  }
  /** 校验路由标识，读取当前作用域中的指定角色详情。 */
  @ApiOperation({ summary: '获取角色详情' })
  @Get('roles/:roleId')
  @AccessPolicy({ scope: 'route' })
  get(@Req() req: FastifyRequest) {
    return this.roles.get({ actor: actor(req), scope: scopeFor(req), roleId: ids(req).roleId! })
  }
  /** 按路由作用域获取角色授权页面所需的权限树和可授权权限键。 */
  @ApiOperation({ summary: '获取角色授权权限树' })
  @Get('permissions')
  @AccessPolicy({ scope: 'route' })
  permissions(@Req() req: FastifyRequest) {
    return this.roles.permissions({ actor: actor(req), scope: scopeFor(req) })
  }
  /** 校验创建请求并在路由对应作用域创建自定义角色。 */
  @ApiOperation({ summary: '创建自定义角色' })
  @Post('roles')
  @AccessPolicy({ scope: 'route', permission: '{scope}.roles.create' })
  create(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.roles.create({
      actor: actor(req),
      scope: scopeFor(req),
      body: parse(createRoleSchema, body),
    })
  }
  /** 校验角色标识、预期版本和资料字段，提交当前作用域的角色更新。 */
  @ApiOperation({ summary: '更新自定义角色' })
  @Patch('roles/:roleId')
  @AccessPolicy({ scope: 'route', permission: '{scope}.roles.update' })
  update(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.roles.change({
      actor: actor(req),
      scope: scopeFor(req),
      roleId: ids(req).roleId!,
      action: 'update',
      body: parse(updateRoleSchema, body),
    })
  }
  /** 校验预期版本与权限键集合，提交当前作用域的角色权限全量替换。 */
  @ApiOperation({ summary: '设置角色权限' })
  @Put('roles/:roleId/permissions')
  @AccessPolicy({ scope: 'route', permission: '{scope}.roles.permissions' })
  permissionsUpdate(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.roles.change({
      actor: actor(req),
      scope: scopeFor(req),
      roleId: ids(req).roleId!,
      action: 'permissions',
      body: parse(permissionsSchema, body),
    })
  }
  /** 从查询参数校验预期版本，提交当前作用域的自定义角色删除。 */
  @ApiOperation({ summary: '删除自定义角色' })
  @Delete('roles/:roleId')
  @AccessPolicy({ scope: 'route', permission: '{scope}.roles.delete' })
  remove(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.roles.change({
      actor: actor(req),
      scope: scopeFor(req),
      roleId: ids(req).roleId!,
      action: 'delete',
      body: parse(deleteSchema, query),
    })
  }
}
