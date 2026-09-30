import { z } from 'zod'
import { ACCESS_ICON_KEY_PATTERN } from 'shared/utils'
import { idSchema, scopeTypeSchema, versionSchema } from '@/modules/access/access.validation'

export const menuQuerySchema = z.strictObject({ scopeType: scopeTypeSchema })
const menuFields = {
  parentId: idSchema.nullable().optional(),
  name: z.string().trim().min(1).max(100),
  icon: z
    .string()
    .max(64)
    .refine((value) => !value || ACCESS_ICON_KEY_PATTERN.test(value))
    .optional(),
  sort: z.number().int().min(0).max(100000).optional(),
  hidden: z.boolean().optional(),
  status: z.enum(['active', 'disabled']).optional(),
}
export const createMenuSchema = z.strictObject({
  expectedVersion: versionSchema,
  type: z.enum(['directory', 'page', 'operation']),
  ...menuFields,
  parentId: idSchema.nullable(),
  routeKey: z.string().max(120).optional(),
  permissionKey: z.string().max(150).optional(),
})
export const updateMenuSchema = z.strictObject({
  expectedVersion: versionSchema,
  ...menuFields,
  name: menuFields.name.optional(),
})
