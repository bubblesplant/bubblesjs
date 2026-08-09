import { Hono } from 'hono'
import { apiFailure, apiSuccess } from '../../common/http/response.js'
import { getLiveness, getReadiness } from './health.service.js'

export const healthRoutes = new Hono()

healthRoutes.get('/live', (context) => context.json(apiSuccess(getLiveness())))

healthRoutes.get('/ready', async (context) => {
  const readiness = await getReadiness()

  if (readiness.status === 'ok') {
    return context.json(apiSuccess(readiness))
  }

  return context.json(apiFailure(503, '服务尚未就绪', readiness), 503)
})
