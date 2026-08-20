import { FastifyAdapter } from '@nestjs/platform-fastify'

const adapter = new FastifyAdapter({
  trustProxy: true,
  logger: false,
})

adapter.getInstance().addHook('onRequest', (request, reply, done) => {
  reply.header('x-request-id', request.id)
  done()
})

export default adapter
