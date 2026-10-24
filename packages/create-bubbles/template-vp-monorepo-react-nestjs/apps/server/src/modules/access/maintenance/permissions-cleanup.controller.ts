import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor } from '../access-http'
import { parse } from '../access.validation'
import { PermissionsCleanupService } from './permissions-cleanup.service'
import { cleanupSchema } from './permissions-cleanup.validation'

@ApiTags('废弃权限清理')
@Controller('platform/permissions')
export class PermissionsCleanupController {
  constructor(private readonly cleanup: PermissionsCleanupService) {}

  /** 向具备清理权限的平台管理员返回废弃权限清理预览及部署证明摘要。 */
  @ApiOperation({ summary: '预览废弃权限清理结果' })
  @Get('cleanup-preview')
  @AccessPolicy({ scope: 'platform', permission: 'platform.menus.cleanup', adminOnly: true })
  preview(@Req() req: FastifyRequest) {
    return this.cleanup.preview(actor(req))
  }

  /** 校验权限键和部署证明摘要，执行平台管理员确认的废弃权限清理。 */
  @ApiOperation({ summary: '清理废弃权限' })
  @Post('cleanup')
  @HttpCode(200)
  @AccessPolicy({ scope: 'platform', permission: 'platform.menus.cleanup', adminOnly: true })
  execute(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.cleanup.cleanup(actor(req), parse(cleanupSchema, body))
  }
}
