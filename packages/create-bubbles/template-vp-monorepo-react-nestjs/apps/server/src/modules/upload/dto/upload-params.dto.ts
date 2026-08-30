import { createZodDto } from 'nestjs-zod'
import z from 'zod'
import { UPLOAD_MAX_PARTS } from '../upload.constants'

export const uploadSessionParamsSchema = z.object({
  uploadSessionId: z.uuid(),
})

export const uploadPartParamsSchema = uploadSessionParamsSchema.extend({
  partNumber: z.coerce.number().int().min(1).max(UPLOAD_MAX_PARTS),
})

export class UploadSessionParamsDto extends createZodDto(uploadPartParamsSchema) {}

export class UploadPartParamsDto extends createZodDto(uploadPartParamsSchema) {}
