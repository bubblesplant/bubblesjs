import { Controller, Get, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor, scopeFor } from '@/modules/access/access-http'
import { parse } from '@/modules/access/access.validation'
import { AuditService } from './audit.service'
import { auditSchema } from './audit.validation'

@ApiTags('审计日志')
@Controller([
  'platform/audit-logs',
  'companies/:companyId/audit-logs',
  'companies/:companyId/projects/:projectId/audit-logs',
])
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  /** 校验分页、操作者及时间筛选参数，读取路由对应作用域内的审计日志。 */
  @ApiOperation({ summary: '获取审计日志列表' })
  @Get()
  @AccessPolicy({ scope: 'route', permission: '{scope}.audit.read' })
  list(@Req() req: FastifyRequest, @Query() raw: unknown) {
    return this.audit.list({
      actor: actor(req),
      scope: scopeFor(req),
      query: parse(auditSchema, raw),
    })
  }
}
