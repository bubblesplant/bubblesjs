import type { ChangePasswordRequest } from 'shared/types'
import z from 'zod'

/** 本人改密校验；保持密码原值，确认密码错误定位到 confirmPassword。 */
export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(16),
    confirmPassword: z.string(),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次密码不一致',
  }) satisfies z.ZodType<ChangePasswordRequest>
