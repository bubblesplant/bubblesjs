import type { AppErrorDefinition } from '@/common/exceptions/app.exception'
import { HttpStatus } from '@nestjs/common'

export const UPLOAD_ERRORS = {
  FILE_EMPTY: {
    code: 'UPLOAD.FILE_EMPTY',
    publicMessage: '空文件不能使用分片上传',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  FILE_TOO_LARGE: {
    code: 'UPLOAD.FILE_TOO_LARGE',
    publicMessage: '文件超过允许的最大大小',
    status: HttpStatus.PAYLOAD_TOO_LARGE,
  },
  CLIENT_UPLOAD_ID_CONFLICT: {
    code: 'UPLOAD.CLIENT_UPLOAD_ID_CONFLICT',
    publicMessage: '该客户端上传标识已用于另一个文件',
    status: HttpStatus.CONFLICT,
  },
  SESSION_NOT_FOUND: {
    code: 'UPLOAD.SESSION_NOT_FOUND',
    publicMessage: '上传会话不存在',
    status: HttpStatus.NOT_FOUND,
  },
  INVALID_STATE: {
    code: 'UPLOAD.INVALID_STATE',
    publicMessage: '当前上传状态不允许执行此操作',
    status: HttpStatus.CONFLICT,
  },
  UPLOAD_EXPIRED: {
    code: 'UPLOAD.UPLOAD_EXPIRED',
    publicMessage: '上传会话已过期，请重新开始',
    status: HttpStatus.GONE,
  },
  PART_NUMBER_INVALID: {
    code: 'UPLOAD.PART_NUMBER_INVALID',
    publicMessage: '分片编号超出当前文件范围',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  PART_LENGTH_REQUIRED: {
    code: 'UPLOAD.PART_LENGTH_REQUIRED',
    publicMessage: '分片请求缺少有效的 Content-Length',
    status: HttpStatus.LENGTH_REQUIRED,
  },
  PART_SIZE_MISMATCH: {
    code: 'UPLOAD.PART_SIZE_MISMATCH',
    publicMessage: '分片实际大小与预期不一致',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  UNSUPPORTED_CONTENT_ENCODING: {
    code: 'UPLOAD.UNSUPPORTED_CONTENT_ENCODING',
    publicMessage: '分片请求不支持压缩编码',
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  },
  PARTS_INCOMPLETE: {
    code: 'UPLOAD.PARTS_INCOMPLETE',
    publicMessage: '分片尚未全部上传或大小不正确',
    status: HttpStatus.CONFLICT,
  },
  PARTS_STILL_ACTIVE: {
    code: 'UPLOAD.PARTS_STILL_ACTIVE',
    publicMessage: '仍有分片正在上传，请稍后重试',
    status: HttpStatus.CONFLICT,
  },
  PART_UPLOAD_ABORTED: {
    code: 'UPLOAD.PART_UPLOAD_ABORTED',
    publicMessage: '分片上传已取消',
    status: HttpStatus.REQUEST_TIMEOUT,
  },
  STORAGE_UPLOAD_MISSING: {
    code: 'UPLOAD.STORAGE_UPLOAD_MISSING',
    publicMessage: '存储中的上传会话已失效，请重新开始',
    status: HttpStatus.GONE,
  },
  STORAGE_UNAVAILABLE: {
    code: 'UPLOAD.STORAGE_UNAVAILABLE',
    publicMessage: '文件存储服务暂时不可用，请稍后重试',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
} as const satisfies Record<string, AppErrorDefinition>
