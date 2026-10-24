import 'reflect-metadata'
import { describe, expect, it, vi } from 'vite-plus/test'
import { drizzle } from 'drizzle-orm/pg-proxy'
import type { AccessDb } from '@/modules/access/access.store'
import { AccessService } from '@/modules/access/access.service'
import { CompaniesService } from '@/modules/companies/companies.service'
import { AdministratorsService } from '@/modules/members/administrators/administrators.service'
import type { MembersService } from '@/modules/members/members.service'
import type { AccessSeedService } from '@/modules/access/seed/access-seed.service'

const firstCompanyId = '00000000-0000-4000-8000-000000000001'
const secondCompanyId = '00000000-0000-4000-8000-000000000002'
const userId = '00000000-0000-4000-8000-000000000003'
const timestamp = '2026-10-23T00:00:00.000Z'
const actor = { userId, requestId: 'company-list-test' }

/** 以真实 Drizzle 查询构造器和受控 SQL 响应验证批量查询，不连接数据库。 */
function fixture(input: { companyRows: unknown[][]; administratorRows?: unknown[][] }) {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const db = drizzle(async (sql, params) => {
    queries.push({ sql, params })
    if (sql.includes('count(*)')) return { rows: [[2]] }
    if (sql.includes('from "companies"')) return { rows: input.companyRows }
    return { rows: input.administratorRows ?? [] }
  }) as unknown as AccessDb
  const read = vi.fn(async (_requirement, operation) => operation(db))
  const isAdministrator = vi.fn()
  const access = { read, isAdministrator } as unknown as AccessService
  const administrators = new AdministratorsService(
    access,
    {} as MembersService,
    {} as AccessSeedService,
  )
  const companies = new CompaniesService(access, {} as MembersService, administrators)
  return { queries, read, isAdministrator, administrators, companies, db }
}

describe('平台企业列表当前管理员', () => {
  it('当前页批量附带全部管理员及失效状态，企业停用不影响身份有效性', async () => {
    const { companies, queries, read, isAdministrator } = fixture({
      companyRows: [
        [firstCompanyId, '停用企业', 'first', '', 'disabled', 1, timestamp, timestamp],
        [secondCompanyId, '其他企业', 'second', '', 'active', 1, timestamp, timestamp],
      ],
      administratorRows: [
        [firstCompanyId, userId, '有效管理员', 'admin_active', 'active', 'active'],
        [firstCompanyId, crypto.randomUUID(), '锁定账号', 'admin_locked', 'locked', 'active'],
        [firstCompanyId, crypto.randomUUID(), '停用成员', 'member_disabled', 'active', 'disabled'],
        [secondCompanyId, crypto.randomUUID(), '停用账号', 'user_disabled', 'disabled', 'active'],
      ],
    })
    const page = await companies.listCompanies({ actor, query: { page: 2, pageSize: 2 } })
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 2 })
    expect(page.items[0]).toMatchObject({
      id: firstCompanyId,
      status: 'disabled',
      administrators: [
        { account: 'admin_active', effective: true },
        { account: 'admin_locked', accountStatus: 'locked', effective: false },
        { account: 'member_disabled', memberStatus: 'disabled', effective: false },
      ],
    })
    expect(page.items[1]!.administrators).toEqual([
      expect.objectContaining({ account: 'user_disabled', effective: false }),
    ])
    expect(queries).toHaveLength(3)
    expect(queries[2]!.sql).toContain('inner join "company_members"')
    expect(queries[2]!.sql).toContain('"company_members"."company_id" = "roles"."company_id"')
    expect(queries[2]!.sql).toContain('"company_members"."user_id" = "users"."id"')
    expect(queries[2]!.sql).toContain('"roles"."project_id" is null')
    expect(queries[2]!.params).toEqual([
      'company',
      'administrator',
      firstCompanyId,
      secondCompanyId,
    ])
    expect(isAdministrator).not.toHaveBeenCalled()
    expect(read).toHaveBeenCalledWith(
      { actor, scope: { type: 'platform' }, permission: 'platform.companies.read' },
      expect.any(Function),
    )
  })

  it('企业没有直接管理员时返回空数组', async () => {
    const { companies } = fixture({
      companyRows: [[firstCompanyId, '企业', 'first', '', 'active', 1, timestamp, timestamp]],
    })
    const page = await companies.listCompanies({ actor, query: {} })
    expect(page.items[0]!.administrators).toEqual([])
  })

  it('空页不执行管理员查询，保留分页总数', async () => {
    const { companies, queries } = fixture({ companyRows: [] })
    await expect(
      companies.listCompanies({ actor, query: { page: 99, pageSize: 20 } }),
    ).resolves.toEqual({ items: [], total: 2, page: 99, pageSize: 20 })
    expect(queries).toHaveLength(2)
  })
})
