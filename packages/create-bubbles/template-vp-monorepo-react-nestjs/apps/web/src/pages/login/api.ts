import type { LoginRequest, LoginResult } from 'shared/types'
import { alovaRequest } from '@/utils/request'
import { createAlovaInstanceFactory } from '@/utils/request/core'

const publicRequest = createAlovaInstanceFactory({
  baseURL: alovaRequest.options.baseURL,
  /** 读取公开接口正文，失败由登录表单展示。 */
  responded(response) {
    return response.data
  },
})

/** 通过不附带会话凭据的请求提交登录信息。 */
export const login = (input: LoginRequest) =>
  publicRequest.Post<LoginResult>('/auth/login', input, { cacheFor: 0, shareRequest: false })
