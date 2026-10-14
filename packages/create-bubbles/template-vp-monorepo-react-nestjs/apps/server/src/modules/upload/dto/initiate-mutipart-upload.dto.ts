import type { InitiateMultipartUploadRequest } from 'shared/types'
import z from 'zod'

/** 校验文件元数据，保留严格对象、安全名称和 MIME 类型约束。 */
export const initiateMultipartUploadSchema = z
  .object({
    clientUploadId: z.uuid(),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\u0000-\u001F\u007F]/u.test(value), 'fileName 不能包含控制字符'),
    fileSize: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    contentType: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/,
        'contentType 必须是安全的 MIME media type，例如 image/png',
      ),
  })
  .strict() satisfies z.ZodType<InitiateMultipartUploadRequest>
