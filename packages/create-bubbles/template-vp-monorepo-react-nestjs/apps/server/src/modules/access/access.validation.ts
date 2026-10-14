import { COMMON_ERRORS } from '@/common/error/common.error'
import { AppException } from '@/common/exceptions/app.exception'
import { toValidationDetails } from 'shared/utils'
import { z } from 'zod'

export const idSchema = z.uuid()
export const versionSchema = z.number().int().positive()
export const accountSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{4,32}$/)
export const nameSchema = z.string().trim().min(2).max(100)
export const descriptionSchema = z.string().trim().max(500)
export const roleIdsSchema = z
  .array(idSchema)
  .max(500)
  .refine((a) => new Set(a).size === a.length)
export const permissionKeysSchema = z
  .array(z.string().min(1).max(150))
  .max(500)
  .refine((a) => new Set(a).size === a.length)
export const scopeTypeSchema = z.enum(['platform', 'company', 'project'])
export const pageSchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  query: z.string().trim().max(100).optional(),
})
export const entityListSchema = pageSchema.extend({
  status: z.enum(['active', 'disabled']).optional(),
})
export const statusSchema = z.strictObject({
  expectedVersion: versionSchema,
  status: z.enum(['active', 'disabled']),
})
export const deleteSchema = z.strictObject({ expectedVersion: z.coerce.number().int().positive() })
/**
 * 按照给定 Zod 规则校验并转换请求数据，将失败结果交给统一参数异常处理。
 *
 * @returns 通过校验且已应用默认值、规范化等转换的数据。
 * @throws 校验失败时抛出统一参数错误，公开详情由全局过滤器清洗。
 */
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new AppException(COMMON_ERRORS.VALIDATION_FAILED, {
      details: toValidationDetails(result.error.issues),
    })
  }
  return result.data
}
