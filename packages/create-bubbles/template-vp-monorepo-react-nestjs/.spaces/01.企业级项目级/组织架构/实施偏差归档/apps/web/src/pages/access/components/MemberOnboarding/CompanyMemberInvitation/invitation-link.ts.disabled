/** 使用一次性 token 组装可直接打开的企业成员邀请完整链接。 */
export function buildCompanyMemberInvitationLink(
  token: string,
  origin = window.location.origin,
): string {
  const url = new URL('/member-invitations/accept', origin)
  url.searchParams.set('token', token)
  return url.toString()
}
