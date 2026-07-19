import { NestFactory } from '@nestjs/core'
import { AppModule } from '@/app.module'
import { logNetworkUrls } from '@/utils/server-address'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

  const config = new DocumentBuilder()
    .setTitle('前后端模板 API')
    .setDescription('接口文档')
    .setVersion('1.0')
    .addBearerAuth() // 用 JWT 就留着,不用可以删
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

void bootstrap()
