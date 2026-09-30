import { Body, Controller, Delete, Get, Patch, Post, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { MenusService } from './menus.service'
import { actor, ids } from '@/modules/access/access-http'
import { deleteSchema, parse } from '@/modules/access/access.validation'
import { createMenuSchema, menuQuerySchema, updateMenuSchema } from './menus.validation'

@Controller('platform')
export class MenusController {
  constructor(private readonly menus: MenusService) {}
  /** 校验目标作用域类型，读取菜单配置可用的权限目录。 */
  @Get('function-catalog')
  @AccessPolicy({ scope: 'platform', permission: 'platform.menus.read' })
  catalog(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.menus.catalog({ actor: actor(req), ...parse(menuQuerySchema, query) })
  }
  /** 校验目标作用域类型，读取平台维护的完整菜单树及版本。 */
  @Get('menus')
  @AccessPolicy({ scope: 'platform', permission: 'platform.menus.read' })
  list(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.menus.list({ actor: actor(req), ...parse(menuQuerySchema, query) })
  }
  /** 校验作用域类型、菜单内容和预期版本，创建菜单并返回更新后的树。 */
  @Post('menus')
  @AccessPolicy({ scope: 'platform', permission: 'platform.menus.create' })
  create(@Req() req: FastifyRequest, @Query() query: unknown, @Body() body: unknown) {
    return this.menus.create({
      actor: actor(req),
      ...parse(menuQuerySchema, query),
      body: parse(createMenuSchema, body),
    })
  }
  /** 校验菜单标识、预期版本及可编辑字段，提交菜单更新。 */
  @Patch('menus/:menuId')
  @AccessPolicy({ scope: 'platform', permission: 'platform.menus.update' })
  update(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.menus.change({
      actor: actor(req),
      menuId: ids(req).menuId!,
      action: 'update',
      body: parse(updateMenuSchema, body),
    })
  }
  /** 校验菜单标识与查询参数中的预期版本，提交菜单删除。 */
  @Delete('menus/:menuId')
  @AccessPolicy({ scope: 'platform', permission: 'platform.menus.delete' })
  remove(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.menus.change({
      actor: actor(req),
      menuId: ids(req).menuId!,
      action: 'delete',
      body: parse(deleteSchema, query),
    })
  }
}
