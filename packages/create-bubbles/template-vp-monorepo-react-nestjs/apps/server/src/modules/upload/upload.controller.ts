import { CurrentAuth } from '@/common/decorators/current-auth.decorator'
import { Body, Controller, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { FastifyRequest } from 'fastify'
import type { Readable } from 'stream'
import { type CurrentAuthType } from '../auth/session/session.types'
import { InitiateMultipartUploadDto } from './dto/initiate-mutipart-upload.dto'
import { UploadService } from './upload.service'

type OctetStreamRequest = FastifyRequest & {
  body: Readable
}

@ApiTags('大文件分片上传')
@ApiBearerAuth('session')
@Controller('uploads/multipart')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @ApiOperation({ summary: '初始化大文件分片上传' })
  @Post()
  initiate(@CurrentAuth() auth: CurrentAuthType, @Body() body: InitiateMultipartUploadDto) {
    return this.uploadService.initiate(auth.userId, body)
  }
}
