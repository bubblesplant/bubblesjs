import { createZodDto } from 'nestjs-zod'
import z from 'zod'

const authUserSchema = z.object({
  id: z.uuid(),
  account: z.string(),
  name: z.string(),
})

export class RegisterResultDto extends createZodDto(authUserSchema) {}

export class LoginResultDto extends createZodDto(
  z.object({
    accessToken: z.string().min(1),
    tokenType: z.literal('Bearer'),
    idleExpiresIn: z.number().int().positive(),
    absoluteExpiresAt: z.iso.datetime(),
  }),
) {}

export class CurrentUserDto extends createZodDto(
  authUserSchema.extend({
    terminal: z.enum(['web', 'desktop', 'mobile']),
  }),
) {}

export class LogoutResultDto extends createZodDto(
  z.object({
    loggedOut: z.literal(true),
  }),
) {}
