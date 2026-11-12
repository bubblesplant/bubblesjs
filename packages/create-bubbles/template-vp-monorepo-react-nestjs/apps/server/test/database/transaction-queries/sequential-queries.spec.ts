import 'reflect-metadata'
import { setImmediate } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vite-plus/test'
import { getTableColumns } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pg-proxy'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { OrganizationScope } from 'shared/types'
import * as schema from '@/database/schema'
import type { AccessDb } from '@/modules/access/access.store'
import type { AccessService } from '@/modules/access/access.service'
import { RolesService } from '@/modules/access/roles/roles.service'
import { PositionsService } from '@/modules/organization/positions/positions.service'
import { OrganizationUnitsService } from '@/modules/organization/units/organization-units.service'
import { OrganizationTemplatesService } from '@/modules/organization/templates/organization-templates.service'

const firstId = '00000000-0000-4000-8000-000000000001'
const secondId = '00000000-0000-4000-8000-000000000002'
const userId = '00000000-0000-4000-8000-000000000003'
const companyId = '00000000-0000-4000-8000-000000000004'
const projectId = '00000000-0000-4000-8000-000000000005'
const treeId = '00000000-0000-4000-8000-000000000006'
const timestamp = '2026-11-12T00:00:00.000Z'
const actor = { userId, requestId: 'sequential-queries-test' }
const scopes: OrganizationScope[] = [
  { type: 'company', companyId },
  { type: 'project', companyId, projectId },
]
const records = [
  { id: firstId, name: '记录甲', code: 'first', version: 3 },
  { id: secondId, name: '记录乙', code: 'second', version: 7 },
]

/** 按真实表的字段顺序构造传输层行数据，让 Drizzle 负责结果映射。 */
function tableRows(table: PgTable, values: Record<string, unknown>[]) {
  return values.map((value) => {
    const record = {
      description: '',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      ...value,
    }
    return Object.keys(getTableColumns(table)).map(
      (key) => record[key as keyof typeof record] ?? null,
    )
  })
}

/** 运行真实查询构造器，使用拒绝重叠查询的单连接替身检查服务层异步流程。 */
function fixture(input: { scope?: OrganizationScope; empty?: boolean; failTable?: string } = {}) {
  const scope = input.scope ?? scopes[0]!
  const unitRows = tableRows(schema.organizationUnits, [
    { ...records[0], treeId, parentId: null, sort: 1 },
  ])
  const rows: Record<string, unknown[][]> = {
    roles: tableRows(
      schema.roles,
      records.map((record) => ({ ...record, scopeType: 'platform' })),
    ),
    positions: tableRows(schema.positions, records),
    organization_templates: tableRows(
      schema.organizationTemplates,
      records.map((record) => ({ ...record, companyId, isDefault: false })),
    ),
    organization_template_units: tableRows(schema.organizationTemplateUnits, [
      { ...records[0], templateId: firstId, templateVersion: 3, parentId: null, sort: 1 },
    ]),
    organization_template_positions: tableRows(schema.organizationTemplatePositions, [
      { ...records[1], templateId: firstId, templateVersion: 3 },
    ]),
    organization_trees: tableRows(schema.organizationTrees, [
      { id: treeId, scopeType: scope.type },
    ]),
    organization_units: unitRows,
    [`${scope.type}_members`]: [[firstId, userId, 'demo_member', '测试成员', 'active', 'active']],
    [`${scope.type}_organization_unit_members`]: [
      [firstId, firstId, userId, 'member', timestamp, timestamp],
    ],
    [`${scope.type}_position_members`]: [
      [firstId, firstId, userId, timestamp],
      [secondId, secondId, userId, timestamp],
    ],
  }
  const queries: Array<{ sql: string; params: unknown[] }> = []
  const failure = new Error('查询失败')
  let active = false
  let overlaps = 0
  const db = drizzle(
    /** 模拟查询仍在执行的异步窗口，在第二条 SQL 开始时立即报告连接重叠。 */
    async (sql, params) => {
      queries.push({ sql, params })
      if (active) {
        overlaps++
        throw new Error('同一事务连接出现重叠查询')
      }
      active = true
      try {
        await setImmediate()
        const table = /from "([^"]+)"/.exec(sql)?.[1] ?? ''
        if (table === input.failTable) throw failure
        if (sql.includes('count(*)')) {
          const value = params.includes(secondId) ? 4 : 2
          return { rows: [[input.empty ? 0 : value]] }
        }
        if (input.empty) return { rows: [] }
        const selected = rows[table] ?? []
        return {
          rows:
            table === 'roles' && params.includes(firstId)
              ? selected.filter((row) => row[0] === firstId)
              : table === 'roles' && params.includes(secondId)
                ? selected.filter((row) => row[0] === secondId)
                : selected,
        }
      } finally {
        active = false
      }
    },
    { schema },
  ) as unknown as AccessDb
  /** 权限不属于本专项，直接把同一个连接及访问上下文传入业务回调。 */
  const execute = vi.fn(async (requirement, operation) =>
    operation(db, { scope: requirement.scope, permissionKeys: [], administrator: true }),
  )
  const audit = vi.fn()
  const access = { read: execute, write: execute, audit } as unknown as AccessService
  return {
    db,
    queries,
    failure,
    audit,
    overlaps: () => overlaps,
    roles: new RolesService(access),
    positions: new PositionsService(access),
    units: new OrganizationUnitsService(access),
    templates: new OrganizationTemplatesService(access),
  }
}

describe('同一事务连接顺序执行查询', () => {
  it('多角色分页顺序聚合详情，并保持记录顺序和分页', async () => {
    const test = fixture()
    const result = await test.roles.list({
      actor,
      scope: { type: 'platform' },
      query: { page: 2, pageSize: 2 },
    })
    expect(result).toMatchObject({ page: 2, pageSize: 2, total: 2 })
    expect(result.items.map((item) => item.id)).toEqual([firstId, secondId])
    expect(test.overlaps()).toBe(0)
  })

  describe.each(scopes)('$type 作用域', (scope) => {
    it('多岗位分页顺序统计任职人数', async () => {
      const test = fixture({ scope })
      const result = await test.positions.list({ actor, scope, query: { page: 1, pageSize: 2 } })
      expect(result).toMatchObject({ total: 2, page: 1, pageSize: 2 })
      expect(result.items.map((item) => [item.id, item.memberCount])).toEqual([
        [firstId, 2],
        [secondId, 4],
      ])
      expect(test.overlaps()).toBe(0)
    })

    it('成员岗位替换后顺序读取多条岗位详情', async () => {
      const test = fixture({ scope })
      const result = await test.positions.replaceMemberPositions({
        actor,
        scope,
        userId,
        body: { positionIds: [firstId, secondId] },
      })
      expect(result.positions.map((item) => item.id)).toEqual([firstId, secondId])
      expect(test.audit).toHaveBeenCalledTimes(1)
      expect(test.overlaps()).toBe(0)
    })

    it('按成员替换组织关系，校验和返回结果均不重叠查询', async () => {
      const test = fixture({ scope })
      const result = await test.units.replaceMemberUnits({
        actor,
        scope,
        userId,
        body: { relations: [{ organizationUnitId: firstId, duty: 'member' }] },
      })
      expect(result.relations).toMatchObject([
        { organizationUnit: { id: firstId, fullPath: '记录甲' }, duty: 'member' },
      ])
      expect(test.audit).toHaveBeenCalledTimes(1)
      expect(test.overlaps()).toBe(0)
    })

    it('按组织单元替换成员后顺序查询成员快照', async () => {
      const test = fixture({ scope })
      const result = await test.units.replaceUnitMembers({
        actor,
        scope,
        unitId: firstId,
        body: { members: [{ userId, duty: 'member' }] },
      })
      expect(result.members).toMatchObject([
        { member: { userId, account: 'demo_member' }, duty: 'member' },
      ])
      expect(test.audit).toHaveBeenCalledTimes(1)
      expect(test.overlaps()).toBe(0)
    })
  })

  it('模板快照顺序读取组织单元与岗位，并保持版本条件', async () => {
    const test = fixture()
    const result = await test.templates.snapshot(test.db, {
      templateId: firstId,
      templateVersion: 3,
    })
    expect(result.units.map((item) => item.id)).toEqual([firstId])
    expect(result.positions.map((item) => item.id)).toEqual([secondId])
    expect(test.queries.map((query) => query.params)).toEqual([
      [firstId, 3],
      [firstId, 3],
    ])
    expect(test.overlaps()).toBe(0)
  })

  it('多模板摘要顺序统计各自当前版本', async () => {
    const test = fixture()
    const result = await test.templates.list({ actor, companyId, query: {} })
    expect(result.items.map((item) => [item.id, item.unitCount, item.positionCount])).toEqual([
      [firstId, 2, 2],
      [secondId, 4, 4],
    ])
    expect(test.queries.slice(2).map((query) => query.params)).toEqual([
      [firstId, 3],
      [firstId, 3],
      [secondId, 7],
      [secondId, 7],
    ])
    expect(test.overlaps()).toBe(0)
  })

  it('空角色、岗位和模板列表不追加详情查询', async () => {
    const test = fixture({ empty: true })
    const roles = await test.roles.list({ actor, scope: { type: 'platform' }, query: {} })
    const positions = await test.positions.list({ actor, scope: scopes[0]!, query: {} })
    const templates = await test.templates.list({ actor, companyId, query: {} })
    for (const result of [roles, positions, templates]) {
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 })
    }
    expect(test.queries).toHaveLength(6)
    expect(test.overlaps()).toBe(0)
  })

  it('快照查询失败向上传播，且不再发起后续岗位查询', async () => {
    const test = fixture({ failTable: 'organization_template_units' })
    await expect(
      test.templates.snapshot(test.db, { templateId: firstId, templateVersion: 3 }),
    ).rejects.toMatchObject({ cause: test.failure })
    expect(test.queries).toHaveLength(1)
    expect(test.overlaps()).toBe(0)
  })
})
