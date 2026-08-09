import { Hono } from 'hono'
import { AppError } from '../../common/errors/app-error.js'
import { apiSuccess } from '../../common/http/response.js'
import { enqueueDemoJobSchema, jobRunIdSchema } from './jobs.schemas.js'
import { createDemoJob, getJobRun } from './jobs.service.js'

export const jobsRoutes = new Hono()

jobsRoutes.post('/demo', async (context) => {
  let body: unknown

  try {
    body = await context.req.json()
  } catch {
    throw new AppError({
      status: 400,
      message: '请求体必须是合法的 JSON',
    })
  }

  const result = enqueueDemoJobSchema.safeParse(body)

  if (!result.success) {
    throw new AppError({
      status: 422,
      message: '请求参数校验失败',
      details: result.error.flatten(),
    })
  }

  const jobRun = await createDemoJob(result.data.payload)
  return context.json(apiSuccess(jobRun, '任务已入队'), 201)
})

jobsRoutes.get('/:id', async (context) => {
  const id = jobRunIdSchema.safeParse(context.req.param('id'))

  if (!id.success) {
    throw new AppError({
      status: 400,
      message: '任务 ID 格式不正确',
    })
  }

  return context.json(apiSuccess(await getJobRun(id.data)))
})
