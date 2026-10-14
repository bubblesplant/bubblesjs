import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { RedisService } from './redis.service'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { RedisGetQuery, RedisSetRequest } from 'shared/types'
import { GetQuerySchema, SetQuerySchema } from './dto/redis-quary.dto'

@ApiTags('Redis 测试')
@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  /**
   * 调用 Redis 连通性探测并将结果包装为 HTTP 响应。
   */
  @ApiOperation({ summary: '测试 Redis 连接' })
  @Get('ping')
  async ping() {
    return { pong: await this.redisService.ping() }
  }

  /**
   * 接收 Redis 测试键值和可选有效期，写入后返回提交的信息。
   */
  @ApiOperation({ summary: '设置键值对' })
  @Post('set')
  async set(@Body({ schema: SetQuerySchema }) body: RedisSetRequest) {
    await this.redisService.set(body.key, body.value, body.ttl)
    return { key: body.key, value: body.value, ttl: body.ttl ?? null }
  }

  // GET /redis/get?key=name
  /**
   * 校验完整 query 对象，从中取出 Redis 键并返回当前值。
   */
  @ApiOperation({ summary: '获取键值对' })
  @Get('get')
  async get(@Query({ schema: GetQuerySchema }) query: RedisGetQuery) {
    return { key: query.key, value: await this.redisService.get(query.key) }
  }
}
