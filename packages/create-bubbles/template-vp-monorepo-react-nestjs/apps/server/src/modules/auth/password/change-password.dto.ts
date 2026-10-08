import { createZodDto } from 'nestjs-zod'
import type { ChangePasswordRequest } from 'shared/types'
import z from 'zod'

/** 本人改密的服务端校验，保持密码原值并检查确认密码一致。 */
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

export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
