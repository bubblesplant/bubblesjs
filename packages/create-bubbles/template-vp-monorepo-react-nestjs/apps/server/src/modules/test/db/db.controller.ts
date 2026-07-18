import { Body, Controller, Get, Post } from '@nestjs/common'
import { DbService } from './db.service'

@Controller('db')
export class DbController {
  constructor(private readonly dbService: DbService) {}

  @Get()
  async ping() {
    return { time: await this.dbService.ping() }
  }

  @Get('users')
  async list() {
    return this.dbService.findAll()
  }

  @Post('user')
  async create(@Body() body: { name: string; email: string }) {
    return this.dbService.create(body.name, body.email)
  }
}
