import { z } from 'zod'

const redisUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
    message: 'must use the redis:// or rediss:// protocol',
  })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().min(1).default('bubbles-server'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(10_000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:9999')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .refine((origins) => origins.length > 0, { message: 'must contain at least one origin' }),
  DATABASE_URL: z.string().url().default('postgresql://postgres:ml@localhost:5432/postgres'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: redisUrlSchema.default('redis://:ml@localhost:6379/0'),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  JOB_QUEUE_NAME: z.string().min(1).default('jobs'),
  JOB_QUEUE_PREFIX: z.string().min(1).default('bubbles'),
  JOB_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10_000),
})

export type AppEnv = z.infer<typeof envSchema>

let cachedEnv: AppEnv | undefined

export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => (issue.path.join('.') || 'environment') + ': ' + issue.message)
      .join('; ')

    throw new Error('Invalid server environment: ' + details)
  }

  cachedEnv = result.data
  return cachedEnv
}
