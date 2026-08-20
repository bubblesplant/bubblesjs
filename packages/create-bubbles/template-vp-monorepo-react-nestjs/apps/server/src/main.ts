import { AppModule } from '@/app.module'
import { logNetworkUrls } from '@/utils/server-address'
import { ConsoleLogger, Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import fastifyAdapter from './common/adapters/fastify.adapter'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    logger: new ConsoleLogger({
      json: process.env.NODE_ENV === 'production',
      colors: process.env.NODE_ENV === 'development',
    }),
  })
  app.enableCors({
    origin: ['*'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['X-Request-Id', 'WWW-Authenticate', 'Retry-After'],
  })

  const config = new DocumentBuilder()
    .setTitle('前后端模板 API')
    .setDescription('接口文档')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Opaque Session Token',
      },
      'session',
    ) // 用 JWT 就留着,不用可以删
    .build()

  // 生成openAPI 文档
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config))

  // 将ui 挂载到/api-docs, json版本会自动在 /api-docs-json
  SwaggerModule.setup('api-docs', app, document)

  const port = Number.parseInt(process.env.PORT ?? '3000', 10)
  const host = process.env.HOST ?? '0.0.0.0'

  await app.listen(port, host)
  logNetworkUrls(port)
}

void bootstrap().catch((cause: unknown) => {
  const logger = new Logger('Bootstrap')
  logger.error('Server boostrap failed', cause instanceof Error ? cause.stack : undefined)
  process.exitCode = 1
})
