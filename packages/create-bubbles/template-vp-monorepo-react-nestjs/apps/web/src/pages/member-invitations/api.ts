import type {
  AcceptCompanyMemberInvitationRequest,
  AcceptCompanyMemberInvitationResult,
} from 'shared/types'
import request from '@/utils/request'

const invitationRequest = request({
  /** 由接受页保留安全 next 并处理登录失效，避免全局 401 跳转丢失邀请 token。 */
  unAuthorizedResponseFunc: () => {},
  isShowErrorMessage: false,
})

/** 使用当前登录账号接受一次性企业成员邀请。 */
export function acceptCompanyMemberInvitation(input: AcceptCompanyMemberInvitationRequest) {
  return invitationRequest.Post<AcceptCompanyMemberInvitationResult>(
    '/company-member-invitations/accept',
    input,
    { cacheFor: 0, shareRequest: false },
  )
}
