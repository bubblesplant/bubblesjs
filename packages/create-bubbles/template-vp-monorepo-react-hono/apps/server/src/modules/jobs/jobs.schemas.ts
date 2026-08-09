import { z } from 'zod'

export const enqueueDemoJobSchema = z
  .object({
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()

export const jobRunIdSchema = z.string().uuid()
