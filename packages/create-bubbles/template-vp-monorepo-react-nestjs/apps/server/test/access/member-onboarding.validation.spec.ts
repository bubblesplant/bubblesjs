import { describe, expect, it } from 'vite-plus/test'
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
})
