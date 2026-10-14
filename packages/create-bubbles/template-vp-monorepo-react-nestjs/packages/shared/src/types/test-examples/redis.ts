/** 示例 Redis 写入请求，ttl 为校验转换后的秒数。 */
export interface RedisSetRequest {
  key: string
  value: string
  ttl?: number
}

export interface RedisGetQuery {
  key: string
}
