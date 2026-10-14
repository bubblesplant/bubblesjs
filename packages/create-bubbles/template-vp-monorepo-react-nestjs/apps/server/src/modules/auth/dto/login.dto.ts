import type { LoginRequest } from 'shared/types'
import { ACCOUNT_PATTERN } from 'shared/utils'
import z from 'zod'

/** 登录请求校验；规范化账号两端空白，密码保持原值。 */
export const loginSchema = z.object({
  account: z.string().trim().min(4).max(32).regex(ACCOUNT_PATTERN, '账号格式错误'),
  password: z.string().min(1).max(128),
}) satisfies z.ZodType<LoginRequest>
