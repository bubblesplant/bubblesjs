import { z } from 'zod'
import {
  accountSchema,
  idSchema,
  nameSchema,
  roleIdsSchema,
  versionSchema,
} from '@/modules/access/access.validation'

export const registerCompanyMemberSchema = z.strictObject({
  name: nameSchema,
  account: accountSchema,
  password: z.string().min(8).max(16),
})
export const projectMemberSchema = z.strictObject({ userId: idSchema })
export const memberRolesSchema = z.strictObject({
  roleIds: roleIdsSchema,
  expectedVersion: versionSchema,
})
