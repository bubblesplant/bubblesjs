import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AuthController } from './auth.controller'
import { AuthRepository } from './auth.repository'
import { AuthService } from './auth.service'
import { SessionAuthGuard } from './guards/session-auth.guard'
import { PasswordService } from './password.service'
import { SessionStoreService } from './session/session-store.service'
import { SessionTokenService } from './session/session-token.service'

@Module({
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    PasswordService,
    SessionTokenService,
    SessionStoreService,
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
  ],
  exports: [SessionStoreService],
})
export class AuthModule {}
