import { Module } from '@nestjs/common'
import { AccessModule } from '@/modules/access/access.module'
import { DictionariesController } from './dictionaries.controller'
import { DictionariesService } from './dictionaries.service'

@Module({
  imports: [AccessModule],
  controllers: [DictionariesController],
  providers: [DictionariesService],
})
export class DictionariesModule {}
