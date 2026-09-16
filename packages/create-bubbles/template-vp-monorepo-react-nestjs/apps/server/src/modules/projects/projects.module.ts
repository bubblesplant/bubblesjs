import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module'
import { MembersModule } from '../members/members.module'
import { OrganizationModule } from '../organization/organization.module'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

@Module({
  imports: [AccessModule, MembersModule, OrganizationModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
