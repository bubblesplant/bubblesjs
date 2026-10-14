import { describe, expect, it } from 'vite-plus/test'
import {
  acceptCompanyMemberInvitationSchema,
  createCompanyMemberInvitationSchema,
  resendCompanyMemberInvitationSchema,
  revokeCompanyMemberInvitationSchema,
} from '@/modules/members/invitations/member-invitations.validation'
import {
  projectMemberSchema,
  registerCompanyMemberSchema,
} from '@/modules/members/members.validation'

describe('成员加入请求严格校验', () => {
  it('企业成员直接注册只接受姓名、账号和密码', () => {
    expect(
      registerCompanyMemberSchema.safeParse({
        name: '测试成员',
        account: 'member_001',
        password: 'password123',
      }).success,
    ).toBe(true)
    expect(
      registerCompanyMemberSchema.safeParse({
        name: '测试成员',
        account: 'member_001',
        password: 'password123',
        userId: crypto.randomUUID(),
      }).success,
    ).toBe(false)
  })

  it('项目成员只接受 userId，旧 account 入口被拒绝', () => {
    expect(projectMemberSchema.safeParse({ userId: crypto.randomUUID() }).success).toBe(true)
    expect(projectMemberSchema.safeParse({ account: 'member_001' }).success).toBe(false)
    expect(
      projectMemberSchema.safeParse({
        userId: crypto.randomUUID(),
        account: 'member_001',
      }).success,
    ).toBe(false)
  })

  it('邀请创建只接受空对象', () => {
    expect(createCompanyMemberInvitationSchema.safeParse({}).success).toBe(true)
    expect(createCompanyMemberInvitationSchema.safeParse({ account: 'member_001' }).success).toBe(
      false,
    )
  })

  it('撤销和重发只接受正整数 expectedVersion', () => {
    for (const schema of [
      revokeCompanyMemberInvitationSchema,
      resendCompanyMemberInvitationSchema,
    ]) {
      expect(schema.safeParse({ expectedVersion: 1 }).success).toBe(true)
      expect(schema.safeParse({ expectedVersion: 0 }).success).toBe(false)
      expect(schema.safeParse({ expectedVersion: 1, token: 'secret' }).success).toBe(false)
    }
  })

  it('接受邀请只允许 43 位 base64url token', () => {
    expect(acceptCompanyMemberInvitationSchema.safeParse({ token: 'A'.repeat(43) }).success).toBe(
      true,
    )
    expect(acceptCompanyMemberInvitationSchema.safeParse({ token: 'A'.repeat(42) }).success).toBe(
      false,
    )
    expect(
      acceptCompanyMemberInvitationSchema.safeParse({ token: `${'A'.repeat(42)}+` }).success,
    ).toBe(false)
    expect(
      acceptCompanyMemberInvitationSchema.safeParse({
        token: 'A'.repeat(43),
        companyId: crypto.randomUUID(),
      }).success,
    ).toBe(false)
  })
})
