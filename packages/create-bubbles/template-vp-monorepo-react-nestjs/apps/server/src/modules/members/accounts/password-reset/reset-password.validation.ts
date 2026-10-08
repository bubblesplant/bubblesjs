import type { ResetAccountPasswordRequest } from 'shared/types'
import { z } from 'zod'

/** 平台重置密码的服务端校验，不修改密码输入原值。 */
export const resetAccountPasswordSchema = z
  .object({
    newPassword: z.string().min(8).max(16),
    confirmPassword: z.string(),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次密码不一致',
  }) satisfies z.ZodType<ResetAccountPasswordRequest>
