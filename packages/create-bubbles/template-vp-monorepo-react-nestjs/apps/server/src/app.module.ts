import {
  appConfig,
  databaseConfig,
  llmConfig,
  queueConfig,
  redisConfig,
  sessionConfig,
  storageConfig,
} from '@/config'
import { RedisModule } from '@nestjs-modules/ioredis'
import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { toValidationDetails } from 'shared/utils'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { COMMON_ERRORS } from './common/error/common.error'
import { AppException } from './common/exceptions/app.exception'
import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { DatabaseModule } from './database/db.module'
import { AuthModule } from './modules/auth/auth.module'
import { TaskQueueModule } from './modules/task-queue/task-queue.module'
import { AccessModule } from './modules/access/access.module'
import { DictionariesModule } from './modules/dictionaries/dictionaries.module'
import { CompaniesModule } from './modules/companies/companies.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { OrganizationModule } from './modules/organization/organization.module'
import { MembersModule } from './modules/members/members.module'
import { MenusModule } from './modules/menus/menus.module'
import { AuditModule } from './modules/audit/audit.module'
import { UploadModule } from './modules/upload/upload.module'
import { ENV_ARR } from './utils/env-arr'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ENV_ARR,
      load: [
        appConfig,
        databaseConfig,
        llmConfig,
        queueConfig,
        redisConfig,
        sessionConfig,
        storageConfig,
      ],
    }),
    DatabaseModule,
    RedisModule.forRootAsync({
      inject: [ConfigService],
      /**
       * 为会话 Redis 创建单节点连接，限制连接和命令等待，并禁用离线排队以便及时暴露故障。
       */
      useFactory: (config) => ({
        type: 'single',
        options: {
          // ioredis 6 默认使用 RESP3，显式保留升级前的 RESP2 连接协议。
          protocol: 2,
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password'),
          db: config.get('redis.db'),
          connectTimeout: 3000,
          commandTimeout: 2000,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        },
      }),
    }),
    TaskQueueModule,
    AuthModule,
    AccessModule,
    DictionariesModule,
    CompaniesModule,
    OrganizationModule,
    ProjectsModule,
    MembersModule,
    MenusModule,
    AuditModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 原生请求 Schema 校验与转换，沿用统一业务错误契约。
    {
      provide: APP_PIPE,
      /** 创建原生校验器，使 trim、coerce、default 和字段剥离输出生效。 */
      useFactory: () =>
        new StandardSchemaValidationPipe({
          transform: true,
          /** 保留校验问题的字段路径和错误码，由全局过滤器清洗公开详情。 */
          exceptionFactory: (issues) =>
            new AppException(COMMON_ERRORS.VALIDATION_FAILED, {
              details: toValidationDetails(issues),
            }),
        }),
    },
    // 按各接口的 SerializeOptions 校验响应并筛选公开字段。
    {
      provide: APP_INTERCEPTOR,
      useClass: StandardSchemaSerializerInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
