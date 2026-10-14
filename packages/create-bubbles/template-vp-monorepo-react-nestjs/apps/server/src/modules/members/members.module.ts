import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module'
import { AuthModule } from '../auth/auth.module'
import { MembersController } from './members.controller'
import { MembersService } from './members.service'
import { AccountsController } from './accounts/accounts.controller'
import { AccountsService } from './accounts/accounts.service'
import { AccountPasswordResetService } from './accounts/password-reset/password-reset.service'
import { AdministratorsService } from './administrators/administrators.service'

@Module({
  imports: [AccessModule, AuthModule],
  controllers: [MembersController, AccountsController],
  providers: [MembersService, AccountsService, AccountPasswordResetService, AdministratorsService],
  exports: [MembersService, AdministratorsService],
})
export class MembersModule {}
