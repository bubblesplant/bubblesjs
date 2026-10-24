import type { RegisterRequest, RegisterResult } from 'shared/types'
import { alovaRequest } from '@/utils/request'
import { createAlovaInstanceFactory } from '@/utils/request/core'

const publicRequest = createAlovaInstanceFactory({
  baseURL: alovaRequest.options.baseURL,
  /** 读取公开接口正文，失败由注册表单展示。 */
  responded(response) {
    return response.data
  },
})

/** 通过公开请求创建账号，避免附带既有会话凭据。 */
export const register = (input: RegisterRequest) =>
  publicRequest.Post<RegisterResult>('/auth/register', input, { cacheFor: 0, shareRequest: false })
