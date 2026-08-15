import { createZodDto } from 'nestjs-zod'
import { RegisterRequest } from 'shared/types'
import { ACCOUNT_PATTERN } from 'shared/utils'
import z from 'zod'

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  account: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(ACCOUNT_PATTERN, '账号只能包含字母、数字和下划线'),
  password: z.string().min(8).max(128),
}) satisfies z.ZodType<RegisterRequest>

export class RegisterDto extends createZodDto(registerSchema) {}
