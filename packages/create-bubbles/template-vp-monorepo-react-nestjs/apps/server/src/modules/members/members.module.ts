import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module'
import { AuthModule } from '../auth/auth.module'
import { MembersController } from './members.controller'
import { MembersService } from './members.service'
import { AccountsController } from './accounts/accounts.controller'
import { AccountsService } from './accounts/accounts.service'
import { AdministratorsService } from './administrators/administrators.service'
import { CompanyMemberInvitationsController } from './invitations/company-member-invitations.controller'
import { MemberInvitationAcceptanceController } from './invitations/member-invitation-acceptance.controller'
import { MemberInvitationsService } from './invitations/member-invitations.service'

@Module({
  imports: [AccessModule, AuthModule],
  controllers: [
    MembersController,
    AccountsController,
    CompanyMemberInvitationsController,
    MemberInvitationAcceptanceController,
  ],
  providers: [MembersService, AccountsService, AdministratorsService, MemberInvitationsService],
  exports: [MembersService, AdministratorsService],
})
export class MembersModule {}
