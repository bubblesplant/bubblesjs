import { z } from 'zod'

export const ORGANIZATION_CODE_PATTERN = /^[A-Za-z0-9_-]+$/
export const ORGANIZATION_MAX_DEPTH = 10
export const ORGANIZATION_MAX_SORT = 999_999_999

export const idSchema = z.uuid()
export const entityStatusSchema = z.enum(['active', 'disabled'])
export const nameSchema = z.string().trim().min(2).max(100)
export const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(ORGANIZATION_CODE_PATTERN)
  .transform((value) => value.toLowerCase())
export const descriptionSchema = z.string().trim().max(500)
const sortSchema = z.number().int().min(0).max(ORGANIZATION_MAX_SORT)
const versionSchema = z.number().int().positive()
const pageFields = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  query: z.string().trim().max(100).optional(),
}
const queryBooleanSchema = z.preprocess((value) => {
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}, z.boolean())
export const candidateArraySchema = z
  .array(idSchema)
  .min(1)
  .max(100)
  .refine((values) => new Set(values).size === values.length)
const candidateQueryArraySchema = z.preprocess((value) => {
  if (typeof value === 'string') return value.split(',').map((item) => item.trim())
  if (Array.isArray(value))
    return value.flatMap((item) =>
      typeof item === 'string' ? item.split(',').map((part) => part.trim()) : [item],
    )
  return value
}, candidateArraySchema)
const replacementIdArraySchema = z
  .array(idSchema)
  .refine((values) => new Set(values).size === values.length)

/** 对显示文本执行唯一键规范化，保留内部空白并统一 Unicode 与大小写。 */
export function normalizeOrganizationKey(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase()
}

/** 对公开编码执行首尾清理、Unicode 规范化和小写保存。 */
export function normalizeOrganizationCode(value: string): string {
  return normalizeOrganizationKey(value)
}

const baseResourceFields = {
  name: nameSchema,
  code: codeSchema,
  description: descriptionSchema.optional(),
}

export const createCompanySchema = z.strictObject({
  ...baseResourceFields,
  administratorUserId: idSchema,
  parentCompanyId: idSchema.nullable().optional(),
  entityType: z.enum(['group', 'company']).optional(),
  sort: sortSchema.optional(),
})

export const updateCompanyHierarchySchema = z.strictObject({
  expectedVersion: versionSchema,
  parentCompanyId: idSchema.nullable(),
  entityType: z.enum(['group', 'company']),
  sort: sortSchema.optional(),
})

const blankInitializationSchema = z.strictObject({ mode: z.literal('blank') })
const templateInitializationSchema = z.strictObject({
  mode: z.literal('template'),
  templateId: idSchema,
  templateVersion: versionSchema,
})

export const createProjectSchema = z.strictObject({
  ...baseResourceFields,
  administratorUserId: idSchema,
  organizationInitialization: z.discriminatedUnion('mode', [
    blankInitializationSchema,
    templateInitializationSchema,
  ]),
})

export const setAdministratorSchema = z.strictObject({
  administratorUserId: idSchema,
  replaceUserId: idSchema.optional(),
})

export const updateProfileSchema = z
  .strictObject({
    expectedVersion: versionSchema,
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    description: descriptionSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'))

export const organizationTreeQuerySchema = z.strictObject({ parentId: idSchema.optional() })

export const createOrganizationUnitSchema = z.strictObject({
  ...baseResourceFields,
  parentId: idSchema.nullable().optional(),
  sort: sortSchema.optional(),
})

export const updateOrganizationUnitSchema = z
  .strictObject({
    expectedVersion: versionSchema,
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    description: descriptionSchema.optional(),
    sort: sortSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'))

export const moveOrganizationUnitSchema = z.strictObject({
  expectedVersion: versionSchema,
  parentId: idSchema.nullable(),
  sort: sortSchema.optional(),
})

export const statusRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
  status: entityStatusSchema,
})

const dutySchema = z.enum(['member', 'leader', 'deputy'])
export const replaceMemberOrganizationUnitsSchema = z.strictObject({
  relations: z
    .array(z.strictObject({ organizationUnitId: idSchema, duty: dutySchema }))
    .refine(
      (relations) =>
        new Set(relations.map(({ organizationUnitId }) => organizationUnitId)).size ===
        relations.length,
    ),
})
export const replaceOrganizationUnitMembersSchema = z.strictObject({
  members: z
    .array(z.strictObject({ userId: idSchema, duty: dutySchema }))
    .refine((members) => new Set(members.map(({ userId }) => userId)).size === members.length),
})

export const positionListQuerySchema = z.strictObject({
  ...pageFields,
  status: entityStatusSchema.optional(),
})
export const createPositionSchema = z.strictObject(baseResourceFields)
export const updatePositionSchema = z
  .strictObject({
    expectedVersion: versionSchema,
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    description: descriptionSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'))
export const replaceMemberPositionsSchema = z.strictObject({
  positionIds: replacementIdArraySchema,
})
export const replacePositionMembersSchema = z.strictObject({ userIds: replacementIdArraySchema })

const templateUnitSchema = z.strictObject({
  clientKey: z.string().trim().min(1).max(100),
  parentClientKey: z.string().trim().min(1).max(100).nullable(),
  ...baseResourceFields,
  sort: sortSchema,
})
const templatePositionSchema = z.strictObject({
  ...baseResourceFields,
  status: entityStatusSchema,
})
const templateDefinitionFields = {
  name: nameSchema,
  description: descriptionSchema.optional(),
  units: z.array(templateUnitSchema),
  positions: z.array(templatePositionSchema),
}
export const organizationTemplateListQuerySchema = z.strictObject({
  ...pageFields,
  status: entityStatusSchema.optional(),
})
export const createOrganizationTemplateSchema = z.strictObject({
  ...templateDefinitionFields,
  isDefault: z.boolean().optional(),
})
export const replaceOrganizationTemplateSchema = z.strictObject({
  expectedVersion: versionSchema,
  ...templateDefinitionFields,
  isDefault: z.boolean(),
})
export const updateOrganizationTemplateStatusSchema = z
  .strictObject({
    expectedVersion: versionSchema,
    status: entityStatusSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(({ status, isDefault }) => status !== undefined || isDefault !== undefined)

const globalPurposeSchema = z.enum(['createCompanyAdministrator', 'setCompanyAdministrator'])
const organizationPurposeSchema = z.enum([
  'browseOrganization',
  'assignPositionMembers',
  'createProjectAdministrator',
  'setProjectAdministrator',
])
export const globalAccountCandidateQuerySchema = z.strictObject({
  ...pageFields,
  purpose: globalPurposeSchema,
})
export const resolveGlobalAccountCandidatesSchema = z.strictObject({
  userIds: candidateArraySchema,
  purpose: globalPurposeSchema,
})
export const organizationMemberCandidateQuerySchema = z.strictObject({
  ...pageFields,
  purpose: organizationPurposeSchema.optional().default('browseOrganization'),
  organizationUnitIds: candidateQueryArraySchema.optional(),
  positionIds: candidateQueryArraySchema.optional(),
  roleIds: candidateQueryArraySchema.optional(),
  projectIds: candidateQueryArraySchema.optional(),
  unassigned: queryBooleanSchema.optional(),
  includeDisabled: queryBooleanSchema.optional().default(true),
})
export const resolveOrganizationMemberCandidatesSchema = z.strictObject({
  userIds: candidateArraySchema,
  purpose: organizationPurposeSchema.optional().default('browseOrganization'),
})
