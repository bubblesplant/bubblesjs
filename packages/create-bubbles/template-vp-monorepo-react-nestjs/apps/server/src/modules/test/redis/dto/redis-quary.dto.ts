import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

// GET /redis/set?key=name&value=tom&ttl=60
export const SetQuerySchema = z.object({
  key: z.string().min(1, 'key不能为空'),
  value: z.string().min(1, 'value不能为空'),
  // url 查询参数都是字符串， z coerce.number() 会自动把 “60” 转换为 60
  ttl: z.coerce.number().int().positive('ttl 必须是正整数').optional(),
})

export class SetQueryDto extends createZodDto(SetQuerySchema) {}

export const GetQuerySchema = z.object({
  key: z.string().min(1, 'key 不能为空'),
})

export class GetQueryDto extends createZodDto(GetQuerySchema) {}
