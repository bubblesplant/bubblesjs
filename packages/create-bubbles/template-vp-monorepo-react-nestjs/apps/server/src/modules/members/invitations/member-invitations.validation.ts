import { z } from 'zod'
import { pageSchema, versionSchema } from '@/modules/access/access.validation'

export const companyMemberInvitationQuerySchema = pageSchema.extend({
  status: z.enum(['pending', 'expired', 'accepted', 'revoked']).optional(),
})

export const createCompanyMemberInvitationSchema = z.strictObject({})

export const revokeCompanyMemberInvitationSchema = z.strictObject({
  expectedVersion: versionSchema,
})

export const resendCompanyMemberInvitationSchema = z.strictObject({
  expectedVersion: versionSchema,
})

export const acceptCompanyMemberInvitationSchema = z.strictObject({
  token: z
    .string()
    .length(43)
    .regex(/^[A-Za-z0-9_-]+$/),
})
