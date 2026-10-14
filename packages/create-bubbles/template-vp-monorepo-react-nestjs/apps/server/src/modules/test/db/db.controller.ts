import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { DbService } from './db.service'
import type { DbCreateUserRequest } from 'shared/types'
import { createUserSchema } from './dto/create-user.dto'

@ApiTags('DB 测试')
@Controller('db')
export class DbController {
  constructor(private readonly dbService: DbService) {}

  /**
   * 返回数据库当前时间，供 HTTP 层验证数据库连通性。
   */
  @ApiOperation({ summary: '测试数据库连接' })
  @Get()
  async ping() {
    return { time: await this.dbService.ping() }
  }

  /**
   * 返回数据库示例服务查询的全部用户记录。
   */
  @ApiOperation({ summary: '获取所有用户' })
  @Get('users')
  async list() {
    return this.dbService.findAll()
  }

  /**
   * 将经原生 Schema 校验的请求体提交给数据库示例服务创建用户。
   */
  @ApiOperation({ summary: '创建用户' })
  @Post('user')
  async create(@Body({ schema: createUserSchema }) body: DbCreateUserRequest) {
    return this.dbService.create(body)
  }
}
