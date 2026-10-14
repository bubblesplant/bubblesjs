import type { RegisterRequest } from 'shared/types'
import { ACCOUNT_PATTERN } from 'shared/utils'
import z from 'zod'

/** 注册请求校验；保持现行账号与 8～16 位密码约束。 */
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  account: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(ACCOUNT_PATTERN, '账号只能包含字母、数字和下划线'),
  password: z.string().min(8).max(16),
}) satisfies z.ZodType<RegisterRequest>
