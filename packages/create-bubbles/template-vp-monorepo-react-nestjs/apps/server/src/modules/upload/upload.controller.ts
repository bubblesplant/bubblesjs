import { CurrentAuth } from '@/common/decorators/current-auth.decorator'
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { type FastifyReply, FastifyRequest } from 'fastify'
import type { Readable } from 'stream'
import { type CurrentAuthType } from '../auth/session/session.types'
import { InitiateMultipartUploadDto } from './dto/initiate-mutipart-upload.dto'
import { UploadPartParamsDto, UploadSessionParamsDto } from './dto/upload-params.dto'
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

  @ApiOperation({ summary: '查询上传状态和已上传分片' })
  @Get(':uploadSessionId')
  getStatus(@CurrentAuth() auth: CurrentAuthType, @Param() params: UploadSessionParamsDto) {
    return this.uploadService.getStatus(auth.userId, params.uploadSessionId)
  }

  @ApiOperation({ summary: '上传一个原始二进制分片' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @HttpCode(HttpStatus.OK)
  @Put(':uploadSessionId/parts/:partNumber')
  uploadPart(
    @CurrentAuth() auth: CurrentAuthType,
    @Param() params: UploadPartParamsDto,
    @Headers('content-length') contentLength: string | undefined,
    @Headers('content-encoding') contentEncoding: string | undefined,
    @Req() request: OctetStreamRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const abortController = new AbortController()
    const onAborted = () => abortController.abort()
    const onReplyClose = () => {
      if (!reply.raw.writableEnded) {
        abortController.abort()
      }
    }

    request.raw.once('aborted', onAborted)
    reply.raw.once('close', onReplyClose)

    return this.uploadService
      .uploadPart({
        ownerId: auth.userId,
        uploadSessionId: params.uploadSessionId,
        partNumber: params.partNumber,
        contentLength,
        contentEncoding,
        body: request.body,
        abortSignal: abortController.signal,
      })
      .finally(() => {
        // 前置校验失败时 Service 可能尚未 pipe 请求体。
        // 统一排空剩余字节，避免连接一直占用到代理超时；这里不会聚合 Buffer。
        if (!request.body.readableEnded && !request.body.destroyed) {
          request.body.resume()
        }

        request.raw.off('aborted', onAborted)
        reply.raw.off('close', onReplyClose)
      })
  }

  @ApiOperation({ summary: '校验并完成分片上传' })
  @HttpCode(HttpStatus.OK)
  @Post(':uploadSessionId/complete')
  complete(@CurrentAuth() auth: CurrentAuthType, @Param() params: UploadSessionParamsDto) {
    return this.uploadService.complete(auth.userId, params.uploadSessionId)
  }

  @ApiOperation({ summary: '取消分片上传' })
  @Delete(':uploadSessionId')
  abort(@CurrentAuth() auth: CurrentAuthType, @Param() params: UploadSessionParamsDto) {
    return this.uploadService.abort(auth.userId, params.uploadSessionId)
  }
}
