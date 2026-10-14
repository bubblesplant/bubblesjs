import { describe, expect, it } from 'vite-plus/test'
import { buildCompanyMemberInvitationLink } from '../src/pages/access/components/MemberOnboarding/CompanyMemberInvitation/invitation-link'
import { buildAuthPath, safeNextPath } from '../src/utils/safe-next'

describe('企业成员邀请导航', () => {
  it('仅保留站内绝对路径作为登录后跳转目标', () => {
    const invitationPath = '/member-invitations/accept?token=abc_123-xyz'
    expect(safeNextPath(invitationPath)).toBe(invitationPath)
    expect(safeNextPath('https://example.com/steal')).toBe('/')
    expect(safeNextPath('//example.com/steal')).toBe('/')
    expect(safeNextPath('/\\example.com/steal')).toBe('/')
    expect(safeNextPath(undefined, '/workspaces')).toBe('/workspaces')
  })

  it('在登录与注册之间完整传递邀请返回路径', () => {
    const next = '/member-invitations/accept?token=abc_123-xyz'
    const loginPath = buildAuthPath('/login', { next, registered: true })
    const params = new URL(loginPath, 'https://wanwu.test').searchParams

    expect(loginPath.startsWith('/login?')).toBe(true)
    expect(params.get('next')).toBe(next)
    expect(params.get('registered')).toBe('1')
    expect(buildAuthPath('/register', { next: 'https://example.com' })).toBe('/register')
  })

  it('用 URLSearchParams 安全组装一次性邀请链接', () => {
    const link = buildCompanyMemberInvitationLink('abc_123-xyz', 'https://wanwu.test')
    const url = new URL(link)

    expect(url.origin).toBe('https://wanwu.test')
    expect(url.pathname).toBe('/member-invitations/accept')
    expect(url.searchParams.get('token')).toBe('abc_123-xyz')
  })
})
