import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AccessPolicy } from '@/common/decorators/access-policy.decorator'
import { actor } from '@/modules/access/access-http'
import { parse } from '@/modules/access/access.validation'
import {
  globalAccountCandidateQuerySchema,
  resolveGlobalAccountCandidatesSchema,
} from '../../organization.validation'
import { GlobalAccountCandidatesService } from './global-account-candidates.service'

@Controller()
export class GlobalAccountCandidatesController {
  constructor(private readonly candidates: GlobalAccountCandidatesService) {}

  /** 校验用途与分页参数，并按用途对应的平台管理权限搜索全局账号候选。 */
  @Get('platform/account-candidates')
  @AccessPolicy({ scope: 'platform' })
  search(@Req() req: FastifyRequest, @Query() query: unknown) {
    return this.candidates.search({
      actor: actor(req),
      query: parse(globalAccountCandidateQuerySchema, query),
    })
  }

  /** 校验最多一百个去重 userId，并按请求顺序回显有权查看的账号候选。 */
  @Post('platform/account-candidates/resolve')
  @AccessPolicy({ scope: 'platform' })
  resolve(@Req() req: FastifyRequest, @Body() body: unknown) {
    return this.candidates.resolve({
      actor: actor(req),
      body: parse(resolveGlobalAccountCandidatesSchema, body),
    })
  }
}
