import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { RedisService } from './redis.service'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { GetQueryDto, SetQueryDto } from './dto/redis-quary.dto'

@ApiTags('Redis 测试')
@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @ApiOperation({ summary: '测试 Redis 连接' })
  @Get('ping')
  async ping() {
    return { pong: await this.redisService.ping() }
  }

  // GET /redis/set?key=name&value=tom&ttl=60
  @ApiOperation({ summary: '设置键值对' })
  @Post('set')
  async set(@Body() body: SetQueryDto) {
    await this.redisService.set(body.key, body.value, body.ttl ? Number(body.ttl) : undefined)
    return { key: body.key, value: body.value, ttl: body.ttl ?? null }
  }

  // GET /redis/get?key=name
  @ApiOperation({ summary: '获取键值对' })
  @Get('get')
  async get(@Query('key') query: GetQueryDto) {
    return { key: query.key, value: await this.redisService.get(query.key) }
  }
}
