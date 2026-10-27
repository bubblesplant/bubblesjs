import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Post,
  Query,
  Req,
  SerializeOptions,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import type {
  CreateDictionaryRequest,
  DictionaryListQuery,
  DictionaryOptionsQuery,
  UpdateDictionaryRequest,
} from 'shared/types'
import {
  createDictionarySchema,
  dictionaryListQuerySchema,
  dictionaryOptionSchema,
  dictionaryOptionsQuerySchema,
  dictionaryOptionsSchema,
  dictionaryPageSchema,
  dictionaryRecordSchema,
  updateDictionarySchema,
} from 'shared/utils'
import { SWAGGER_SESSION_AUTH } from '@/common/constants/swagger.constants'
import { AccessPolicy, Authenticated } from '@/common/decorators/access-policy.decorator'
import { actor, ids, scopeFor } from '@/modules/access/access-http'
import { DictionariesService } from './dictionaries.service'

const paths = [
  'platform/dictionaries',
  'companies/:companyId/dictionaries',
  'companies/:companyId/projects/:projectId/dictionaries',
]

@ApiTags('数据字典')
@ApiBearerAuth(SWAGGER_SESSION_AUTH)
@Controller()
export class DictionariesController {
  constructor(private readonly service: DictionariesService) {}

  /** 分页查询当前作用域字典，严格校验查询参数并序列化公开字段。 */
  @Get(paths)
  @AccessPolicy({ scope: 'route', permission: '{scope}.dictionaries.read' })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '查询当前归属的数据字典' })
  @ApiOkResponse({ standardSchema: dictionaryPageSchema })
  @SerializeOptions({ schema: dictionaryPageSchema })
  list(
    @Req() req: FastifyRequest,
    @Query({ schema: dictionaryListQuerySchema }) query: DictionaryListQuery,
  ) {
    return this.service.list({ actor: actor(req), scope: scopeFor(req), query })
  }

  /** 创建字典，平台管理员限制在业务写事务内再次校验。 */
  @Post(paths)
  @AccessPolicy({ scope: 'route', permission: '{scope}.dictionaries.create' })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '创建数据字典' })
  @ApiCreatedResponse({ standardSchema: dictionaryRecordSchema })
  @SerializeOptions({ schema: dictionaryRecordSchema })
  create(
    @Req() req: FastifyRequest,
    @Body({ schema: createDictionarySchema }) body: CreateDictionaryRequest,
  ) {
    return this.service.create({ actor: actor(req), scope: scopeFor(req), body })
  }

  /** 按归属及版本整体编辑字典，编码和已有业务值保持稳定。 */
  @Patch(paths.map((path) => `${path}/:dictionaryId`))
  @AccessPolicy({ scope: 'route', permission: '{scope}.dictionaries.update' })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '编辑数据字典及其选项' })
  @ApiOkResponse({ standardSchema: dictionaryRecordSchema })
  @SerializeOptions({ schema: dictionaryRecordSchema })
  update(
    @Req() req: FastifyRequest,
    @Body({ schema: updateDictionarySchema }) body: UpdateDictionaryRequest,
  ) {
    return this.service.update({
      actor: actor(req),
      scope: scopeFor(req),
      dictionaryId: ids(req).dictionaryId!,
      body,
    })
  }

  /** 读取业务选项，与配置页权限分离，真实范围授权由服务执行。 */
  @Get('dictionary-options')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '按明确归属读取启用的字典选项' })
  @ApiOkResponse({ standardSchema: dictionaryOptionsSchema })
  // Nest 原生序列化器对数组逐项处理，因此这里使用单项 Schema。
  @SerializeOptions({ schema: dictionaryOptionSchema })
  options(
    @Req() req: FastifyRequest,
    @Query({ schema: dictionaryOptionsQuerySchema }) query: DictionaryOptionsQuery,
  ) {
    return this.service.options({ actor: actor(req), query })
  }
}
