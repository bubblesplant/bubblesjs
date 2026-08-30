import { createZodDto } from 'nestjs-zod'
import z from 'zod'

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
  .strict()

export class InitiateMultipartUploadDto extends createZodDto(initiateMultipartUploadSchema) {}
