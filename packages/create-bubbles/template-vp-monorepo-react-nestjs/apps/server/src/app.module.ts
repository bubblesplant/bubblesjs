import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { appConfig, databaseConfig, llmConfig, redisConfig } from '@/config'
import { ResponseInterceptor } from '@/common/interceptors/transform'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { RedisModule } from '@nestjs-modules/ioredis'
import { TestRedisModule } from './modules/test/redis/redis.module'
import { DatabaseModule } from './db/db.module'
import { TestDbModule } from './modules/test/db/db.module'

const nodeEnv = process.env.NODE_ENV ?? 'development'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${nodeEnv}`, '.env'],
      load: [appConfig, databaseConfig, llmConfig, redisConfig],
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
  ],
})
export class AppModule {}
