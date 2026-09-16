import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module'
import { GlobalAccountCandidatesController } from './candidates/global-account/global-account-candidates.controller'
import { GlobalAccountCandidatesService } from './candidates/global-account/global-account-candidates.service'
import { MemberCandidatesController } from './candidates/member-candidates.controller'
import { MemberCandidatesService } from './candidates/member-candidates.service'
import { ProjectOrganizationInitializationService } from './initialization/project-organization-initialization.service'
import { PositionsController } from './positions/positions.controller'
import { PositionsService } from './positions/positions.service'
import { OrganizationTemplatesController } from './templates/organization-templates.controller'
import { OrganizationTemplatesService } from './templates/organization-templates.service'
import { OrganizationUnitsController } from './units/organization-units.controller'
import { OrganizationUnitsService } from './units/organization-units.service'

@Module({
  imports: [AccessModule],
  controllers: [
    OrganizationUnitsController,
    PositionsController,
    OrganizationTemplatesController,
    MemberCandidatesController,
    GlobalAccountCandidatesController,
  ],
  providers: [
    OrganizationUnitsService,
    PositionsService,
    OrganizationTemplatesService,
    MemberCandidatesService,
    GlobalAccountCandidatesService,
    ProjectOrganizationInitializationService,
  ],
  exports: [ProjectOrganizationInitializationService, OrganizationTemplatesService],
})
export class OrganizationModule {}
