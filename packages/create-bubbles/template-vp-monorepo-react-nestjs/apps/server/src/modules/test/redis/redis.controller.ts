import { Controller, Get, Query } from '@nestjs/common'
import { RedisService } from './redis.service'

@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Get('ping')
  async ping() {
    return { pong: await this.redisService.ping() }
  }

  // GET /redis/set?key=name&value=tom&ttl=60
  @Get('set')
  async set(@Query('key') key: string, @Query('value') value: string, @Query('ttl') ttl?: string) {
    await this.redisService.set(key, value, ttl ? Number(ttl) : undefined)
    return { key, value, ttl: ttl ?? null }
  }

  // GET /redis/get?key=name
  @Get('get')
  async get(@Query('key') key: string) {
    return { key, value: await this.redisService.get(key) }
  }
}
