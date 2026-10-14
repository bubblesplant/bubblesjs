import type {
  AuthUser,
  ChangePasswordResult,
  CurrentUser,
  LoginResult,
  LogoutResult,
  RegisterResult,
} from 'shared/types'
import z from 'zod'

/** 用户公开字段白名单；禁止在这里加入 passwordHash 等内部字段。 */
export const authUserSchema = z.object({
  id: z.uuid(),
  account: z.string(),
  name: z.string(),
}) satisfies z.ZodType<AuthUser>

export const registerResultSchema = authUserSchema satisfies z.ZodType<RegisterResult>

export const loginResultSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  idleExpiresIn: z.number().int().positive(),
  absoluteExpiresAt: z.iso.datetime(),
}) satisfies z.ZodType<LoginResult>

export const currentUserSchema = authUserSchema.extend({
  terminal: z.enum(['web', 'desktop', 'mobile']),
}) satisfies z.ZodType<CurrentUser>

export const logoutResultSchema = z.object({
  loggedOut: z.literal(true),
}) satisfies z.ZodType<LogoutResult>

export const changePasswordResultSchema = z.object({
  passwordChanged: z.literal(true),
}) satisfies z.ZodType<ChangePasswordResult>
