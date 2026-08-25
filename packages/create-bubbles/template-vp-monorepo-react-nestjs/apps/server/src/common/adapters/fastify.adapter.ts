import { FastifyAdapter } from '@nestjs/platform-fastify'
import { randomUUID } from 'crypto'

export function createFastifyAdapter() {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    genReqId: () => randomUUID(),
    logger: false,
  })

  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id)
    done()
  })
  return adapter
}
