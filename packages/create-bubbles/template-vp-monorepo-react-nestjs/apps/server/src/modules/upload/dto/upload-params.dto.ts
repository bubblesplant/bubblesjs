import type { UploadPartParams, UploadSessionParams } from 'shared/types'
import z from 'zod'
import { UPLOAD_MAX_PARTS } from '../upload.constants'

export const uploadSessionParamsSchema = z.object({
  uploadSessionId: z.uuid(),
}) satisfies z.ZodType<UploadSessionParams>

export const uploadPartParamsSchema = uploadSessionParamsSchema.extend({
  partNumber: z.coerce.number().int().min(1).max(UPLOAD_MAX_PARTS),
}) satisfies z.ZodType<UploadPartParams>
