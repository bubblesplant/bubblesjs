import { isH5, uploadApiAffix } from '@/utils/env'
import { alovaUploadRequest } from '@/utils/request'

interface UploadBaseParams {
  fileMd5: string
  fileSize: number
  filename: string
  companyId: string
  projectId: string
  indexDbId: number
}

export interface H5UploadParams extends UploadBaseParams {
  file: Blob
}

export interface MpUploadParams extends UploadBaseParams {
  filePath: string
}

export type UploadParams = H5UploadParams | MpUploadParams

export function uploadFile(data: any) {
  if (isH5) {
    // H5 端用 fetch 发送 FormData，绕过 Taro 适配器的序列化问题
    return fetch(`/${uploadApiAffix}/files/uploadFileAppend`, {
      method: 'POST',
      body: data,
      // headers: {
      // 'Content-Type': 'multipart/form-data',
      // authorization: 'Bearer 9a2d60a8-d9a6-40a3-9b13-4288225d855d',
      // },
    }).then(res => res.json())
  }
  else {
    // 小程序端：用 Taro uploadFile 适配器
    const { filePath, fileMd5, fileSize, filename, companyId, projectId, indexDbId } = data
    return alovaUploadRequest.Post(`/files/uploadFileAppend`, {
      name: 'file',
      filePath,
      fileMd5,
      fileSize,
      filename,
      companyId,
      projectId,
      indexDbId,
    }, {
      requestType: 'upload',
      fileName: filename,
      meta: { isWrapped: false },
    })
  }
}
