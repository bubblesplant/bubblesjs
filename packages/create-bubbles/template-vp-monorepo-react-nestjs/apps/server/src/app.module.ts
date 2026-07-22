import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { appConfig, databaseConfig, llmConfig, redisConfig, authConfig } from '@/config'
import { ResponseInterceptor } from '@/common/interceptors/transform'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { RedisModule } from '@nestjs-modules/ioredis'
import { TestRedisModule } from './modules/test/redis/redis.module'
import { DatabaseModule } from './database/db.module'
import { TestDbModule } from './modules/test/db/db.module'
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod'

const nodeEnv = process.env.NODE_ENV ?? 'development'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${nodeEnv}.local`, '.env.local', `.env.${nodeEnv}`, '.env'],
      load: [appConfig, databaseConfig, llmConfig, redisConfig, authConfig],
    }),
    DatabaseModule,
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config) => ({
        type: 'single',
        options: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password'),
          db: config.get('redis.db'),
        },
      }),
    }),
    TestRedisModule,
    TestDbModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    // ZOD 全局校验管道
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    // 相应序列化拦截器（让相应也走Zod 防泄漏字段）
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
  ],
})
export class AppModule {}
