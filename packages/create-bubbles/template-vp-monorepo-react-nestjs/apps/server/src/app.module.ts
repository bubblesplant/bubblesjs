import { ResponseInterceptor } from '@/common/interceptors/transform'
import { appConfig, authConfig, databaseConfig, llmConfig, redisConfig } from '@/config'
import { RedisModule } from '@nestjs-modules/ioredis'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { DatabaseModule } from './database/db.module'
import { TestDbModule } from './modules/test/db/db.module'
import { TestRedisModule } from './modules/test/redis/redis.module'
import { ENV_ARR } from './utils/env-arr'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ENV_ARR,
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
