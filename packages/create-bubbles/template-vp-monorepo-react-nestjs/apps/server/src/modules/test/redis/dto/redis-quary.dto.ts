import { z } from 'zod'
import type { RedisGetQuery, RedisSetRequest } from 'shared/types'

/** 校验示例写入请求，并将可选有效期转换为正整数秒。 */
export const SetQuerySchema = z.object({
  key: z.string().min(1, 'key不能为空'),
  value: z.string().min(1, 'value不能为空'),
  // url 查询参数都是字符串， z coerce.number() 会自动把 “60” 转换为 60
  ttl: z.coerce.number().int().positive('ttl 必须是正整数').optional(),
}) satisfies z.ZodType<RedisSetRequest>

export const GetQuerySchema = z.object({
  key: z.string().min(1, 'key 不能为空'),
}) satisfies z.ZodType<RedisGetQuery>
