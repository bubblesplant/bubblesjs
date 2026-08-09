import { cors } from 'hono/cors'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { AppError } from './common/errors/app-error.js'
import { apiFailure, apiSuccess } from './common/http/response.js'
import { appLogger } from './common/logger.js'
import { getEnv } from './config/env.js'
import { healthRoutes } from './modules/health/health.routes.js'
import { jobsRoutes } from './modules/jobs/jobs.routes.js'

export function createApp() {
  const env = getEnv()
  const app = new Hono()
  const allowEveryOrigin = env.CORS_ORIGINS.includes('*')

  app.use('*', requestId())
  app.use('*', secureHeaders())
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (allowEveryOrigin) return '*'
        return env.CORS_ORIGINS.includes(origin) ? origin : ''
      },
      credentials: !allowEveryOrigin,
    }),
  )

  if (env.NODE_ENV !== 'test') {
    app.use('*', logger())
  }

  app.get('/', (context) =>
    context.json(
      apiSuccess({
        name: env.APP_NAME,
        environment: env.NODE_ENV,
        health: '/health/live',
        apiHealth: '/api/health/live',
      }),
    ),
  )
  app.route('/health', healthRoutes)
  app.route('/api/health', healthRoutes)
  app.route('/v1/jobs', jobsRoutes)
  app.route('/api/v1/jobs', jobsRoutes)

  app.notFound((context) => context.json(apiFailure(404, '接口不存在'), 404))
  app.onError((error, context) => {
    if (error instanceof AppError) {
      return context.json(apiFailure(error.code, error.message, error.details), error.status)
    }

    appLogger.error('Unhandled request error', {
      method: context.req.method,
      path: context.req.path,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    const message = env.NODE_ENV === 'production' ? '服务内部错误' : error.message
    return context.json(apiFailure(500, message), 500)
  })

  return app
}
