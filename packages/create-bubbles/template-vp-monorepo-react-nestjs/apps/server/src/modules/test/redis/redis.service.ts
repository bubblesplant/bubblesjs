import { Injectable } from '@nestjs/common'
import { InjectRedis } from '@nestjs-modules/ioredis'
import Redis from 'ioredis'

@Injectable()
export class RedisService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async ping() {
    return this.redis.ping()
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.set(key, value, 'EX', ttlSeconds)
    } else {
      await this.redis.set(key, value)
    }
    return 'Ok'
  }

  async get(key: string) {
    return this.redis.get(key)
  }

  async del(key: string) {
    return this.redis.del(key)
  }

  async exist(key: string) {
    return (await this.redis.exists(key)) === 1
  }

  async keys(pattern: string) {
    return this.redis.keys(pattern)
  }
}
