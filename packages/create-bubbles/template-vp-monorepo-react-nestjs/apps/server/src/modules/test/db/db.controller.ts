import { Body, Controller, Get, Post } from '@nestjs/common'
import { DbService } from './db.service'
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CreateUserDto } from './dto/create-user.dto'

@ApiTags('DB 测试')
@Controller('db')
export class DbController {
  constructor(private readonly dbService: DbService) {}

  @ApiOperation({ summary: '测试数据库连接' })
  @Get()
  async ping() {
    return { time: await this.dbService.ping() }
  }

  @ApiOperation({ summary: '获取所有用户' })
  @Get('users')
  async list() {
    return this.dbService.findAll()
  }

  @ApiOperation({ summary: '创建用户' })
  @Post('user')
  async create(@Body() body: CreateUserDto) {
    return this.dbService.create(body)
  }
}
