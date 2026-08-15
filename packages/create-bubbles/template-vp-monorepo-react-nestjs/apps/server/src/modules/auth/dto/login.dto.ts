import { createZodDto } from 'nestjs-zod'
import { LoginRequest } from 'shared/types'
import { ACCOUNT_PATTERN } from 'shared/utils'
import z from 'zod'

export const loginSchema = z.object({
  account: z.string().trim().min(4).max(32).regex(ACCOUNT_PATTERN, '账号格式错误'),
  password: z.string().min(1).max(128),
}) satisfies z.ZodType<LoginRequest>

export class LoginDto extends createZodDto(loginSchema) {}
