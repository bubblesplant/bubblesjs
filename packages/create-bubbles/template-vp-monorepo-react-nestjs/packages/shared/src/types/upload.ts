/** 初始化分片上传所需的客户端标识和文件元数据。 */
export interface InitiateMultipartUploadRequest {
  clientUploadId: string
  fileName: string
  fileSize: number
  contentType: string
}

export interface UploadSessionParams {
  uploadSessionId: string
}

/** partNumber 为经过参数校验转换后的整数。 */
export interface UploadPartParams extends UploadSessionParams {
  partNumber: number
}
