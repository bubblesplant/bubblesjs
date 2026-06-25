import { NestFactory } from '@nestjs/core'
import { AppModule } from '@/app.module'
import { logNetworkUrls } from '@/utils/server-address'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const port = Number.parseInt(process.env.PORT ?? '3000', 10)
  const host = process.env.HOST ?? '0.0.0.0'

  await app.listen(port, host)

  logNetworkUrls(port)
}

void bootstrap()
