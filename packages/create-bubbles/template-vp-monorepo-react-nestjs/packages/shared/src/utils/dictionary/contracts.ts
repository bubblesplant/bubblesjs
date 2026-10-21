import { z } from 'zod'

export const DICTIONARY_CODE_PATTERN = /^[a-z][a-z0-9_]*$/
export const DICTIONARY_MAX_ITEMS = 500
const statusSchema = z.enum(['active', 'disabled'])
const codeSchema = z.string().trim().min(1).max(64).regex(DICTIONARY_CODE_PATTERN)
export const dictionaryItemSchema = z.strictObject({
  value: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(100),
  sort: z.number().int().min(0).max(999999),
  status: statusSchema,
})
const fields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(''),
  status: statusSchema.default('active'),
  items: z
    .array(dictionaryItemSchema)
    .max(DICTIONARY_MAX_ITEMS)
    .refine(
      (items) => new Set(items.map((item) => item.value)).size === items.length,
      '同一字典的选项值不能重复',
    ),
}
export const createDictionarySchema = z.strictObject({ code: codeSchema, ...fields })
export const updateDictionarySchema = z.strictObject({
  ...fields,
  expectedVersion: z.number().int().positive(),
})
export const dictionaryListQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  query: z.string().trim().max(100).optional(),
  status: statusSchema.optional(),
})
export const dictionaryScopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('platform') }),
  z.strictObject({ type: z.literal('company'), companyId: z.uuid() }),
  z.strictObject({ type: z.literal('project'), companyId: z.uuid(), projectId: z.uuid() }),
])
export const dictionaryOptionsQuerySchema = z.discriminatedUnion('scopeType', [
  z.strictObject({ scopeType: z.literal('platform'), code: codeSchema }),
  z.strictObject({ scopeType: z.literal('company'), companyId: z.uuid(), code: codeSchema }),
  z.strictObject({
    scopeType: z.literal('project'),
    companyId: z.uuid(),
    projectId: z.uuid(),
    code: codeSchema,
  }),
])
export const dictionaryOptionSchema = z.strictObject({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(100),
})
export const dictionaryOptionsSchema = z.array(dictionaryOptionSchema).max(DICTIONARY_MAX_ITEMS)
export const dictionaryRecordSchema = z.strictObject({
  ...createDictionarySchema.shape,
  id: z.uuid(),
  scope: dictionaryScopeSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export const dictionaryPageSchema = z.strictObject({
  items: z.array(dictionaryRecordSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})
