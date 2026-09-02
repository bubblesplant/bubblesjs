import { Module } from '@nestjs/common'
import { MinioStorageAdapter } from './storage/minio-storage.adapter'
import { STORAGE_PORT } from './storage/storage.port'
import { UploadController } from './upload.controller'
import { UploadRepository } from './upload.reponsitory'
import { UploadService } from './upload.service'

@Module({
  controllers: [UploadController],
  providers: [
    UploadRepository,
    UploadService,
    MinioStorageAdapter,
    {
      provide: STORAGE_PORT,
      useExisting: MinioStorageAdapter,
    },
  ],
})
export class UploadModule {}
