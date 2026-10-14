import { CurrentAuth } from '@/common/decorators/current-auth.decorator'
import { Authenticated } from '@/common/decorators/access-policy.decorator'
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
import type {
  InitiateMultipartUploadRequest,
  UploadPartParams,
  UploadSessionParams,
} from 'shared/types'
import { type CurrentAuthType } from '../auth/session/session.types'
import { initiateMultipartUploadSchema } from './dto/initiate-mutipart-upload.dto'
import { uploadPartParamsSchema, uploadSessionParamsSchema } from './dto/upload-params.dto'
import { UploadService } from './upload.service'

type OctetStreamRequest = FastifyRequest & {
  body: Readable
}

@ApiTags('大文件分片上传')
@ApiBearerAuth('session')
@Controller('uploads/multipart')
@Authenticated()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * 为当前认证用户初始化分片上传，客户端上传标识用于幂等复用。
   */
  @ApiOperation({ summary: '初始化大文件分片上传' })
  @Post()
  initiate(
    @CurrentAuth() auth: CurrentAuthType,
    @Body({ schema: initiateMultipartUploadSchema }) body: InitiateMultipartUploadRequest,
  ) {
    return this.uploadService.initiate(auth.userId, body)
  }

  /**
   * 查询当前用户上传会话的状态及已上传分片。
   */
  @ApiOperation({ summary: '查询上传状态和已上传分片' })
  @Get(':uploadSessionId')
  getStatus(
    @CurrentAuth() auth: CurrentAuthType,
    @Param({ schema: uploadSessionParamsSchema }) params: UploadSessionParams,
  ) {
    return this.uploadService.getStatus(auth.userId, params.uploadSessionId)
  }

  /**
   * 将原始二进制请求流交给分片服务，并在连接中断时取消存储请求。
   * @remarks 请求结束后排空未消费字节并移除监听器，避免连接和事件处理器泄漏。
   */
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
    @Param({ schema: uploadPartParamsSchema }) params: UploadPartParams,
    @Headers('content-length') contentLength: string | undefined,
    @Headers('content-encoding') contentEncoding: string | undefined,
    @Req() request: OctetStreamRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const abortController = new AbortController()
    /**
     * 在客户端中止请求时触发存储上传的取消信号。
     */
    const onAborted = () => abortController.abort()
    /**
     * 响应尚未正常结束而连接已关闭时，取消正在进行的存储上传。
     */
    const onReplyClose = () => {
      if (!reply.raw.writableEnded) {
        abortController.abort()
      }
    }

    request.raw.once('aborted', onAborted)
    reply.raw.once('close', onReplyClose)

    return (
      this.uploadService
        .uploadPart({
          ownerId: auth.userId,
          uploadSessionId: params.uploadSessionId,
          partNumber: params.partNumber,
          contentLength,
          contentEncoding,
          body: request.body,
          abortSignal: abortController.signal,
        })
        /** 无论前置校验还是存储操作成功与否，均排空请求流并释放连接监听器。 */
        .finally(() => {
          // 前置校验失败时 Service 可能尚未 pipe 请求体。
          // 统一排空剩余字节，避免连接一直占用到代理超时；这里不会聚合 Buffer。
          if (!request.body.readableEnded && !request.body.destroyed) {
            request.body.resume()
          }

          request.raw.off('aborted', onAborted)
          reply.raw.off('close', onReplyClose)
        })
    )
  }

  /**
   * 以当前用户身份请求校验并完成指定分片上传。
   */
  @ApiOperation({ summary: '校验并完成分片上传' })
  @HttpCode(HttpStatus.OK)
  @Post(':uploadSessionId/complete')
  complete(
    @CurrentAuth() auth: CurrentAuthType,
    @Param({ schema: uploadSessionParamsSchema }) params: UploadSessionParams,
  ) {
    return this.uploadService.complete(auth.userId, params.uploadSessionId)
  }

  /**
   * 以当前用户身份取消指定上传会话并清理存储分片。
   */
  @ApiOperation({ summary: '取消分片上传' })
  @Delete(':uploadSessionId')
  abort(
    @CurrentAuth() auth: CurrentAuthType,
    @Param({ schema: uploadSessionParamsSchema }) params: UploadSessionParams,
  ) {
    return this.uploadService.abort(auth.userId, params.uploadSessionId)
  }
}
