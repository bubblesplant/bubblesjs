import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { and, eq, inArray } from 'drizzle-orm'
import Redis from 'ioredis'
import { ConfigService } from '@nestjs/config'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { CompanyDetail, MemberRecord, PermissionDefinition, ProjectDetail } from 'shared/types'
import * as schema from '@/database/schema'
import { AccessService } from '@/modules/access/access.service'
import { AccessSeedService } from '@/modules/access/seed/access-seed.service'
import { MembersService } from '@/modules/members/members.service'
import { CompaniesService } from '@/modules/companies/companies.service'
import { ProjectsService } from '@/modules/projects/projects.service'
import { ProjectOrganizationInitializationService } from '@/modules/organization/initialization/project-organization-initialization.service'
import { OrganizationTemplatesService } from '@/modules/organization/templates/organization-templates.service'
import { OrganizationUnitsService } from '@/modules/organization/units/organization-units.service'
import { MemberCandidatesService } from '@/modules/organization/candidates/member-candidates.service'
import { GlobalAccountCandidatesService } from '@/modules/organization/candidates/global-account/global-account-candidates.service'
import { AdministratorsService } from '@/modules/members/administrators/administrators.service'
import { AccountsService } from '@/modules/members/accounts/accounts.service'
import { WorkspacesService } from '@/modules/access/workspaces/workspaces.service'
import { RolesService } from '@/modules/access/roles/roles.service'
import { MenusService } from '@/modules/menus/menus.service'
import { PermissionsCleanupService } from '@/modules/access/maintenance/permissions-cleanup.service'
import { SessionStoreService } from '@/modules/auth/session/session-store.service'
import { AuthRepository } from '@/modules/auth/auth.repository'
import { lockAccess } from '@/modules/access/access.store'
import { ACCESS_CATALOG_VERSION, ACCESS_ICON_NAMES, ACCESS_PERMISSION_CATALOG } from 'shared/utils'

// 仅测试模块扩展目录；生产首版没有废弃功能，不加入虚构的业务菜单。
vi.mock('shared/utils', async (original) => {
  const actual = await original<typeof import('shared/utils')>()
  const fixture: PermissionDefinition[] = [
    {
      key: 'company.fixture.read',
      scopeType: 'company',
      kind: 'page',
      title: '测试发布功能',
      routeKey: 'company.fixture',
      pagePermissionKey: null,
      adminOnly: false,
      deprecated: false,
    },
    {
      key: 'company.fixture.update',
      scopeType: 'company',
      kind: 'operation',
      title: '测试发布操作',
      routeKey: 'company.fixture',
      pagePermissionKey: 'company.fixture.read',
      adminOnly: false,
      deprecated: false,
    },
  ]
  // 只在当前测试模块修改内存目录，保留真实 getBuiltinPermissionKeys 的升级规则。
  ;(actual.ACCESS_PERMISSION_CATALOG as PermissionDefinition[]).push(...fixture)
  return actual
})

const enabled = process.env.RUN_ACCESS_INTEGRATION === 'true'
const databaseName = `access_it_${crypto.randomUUID().replaceAll('-', '')}`
const actor = (userId: string) => ({ userId, requestId: crypto.randomUUID() })
/** 创建可从外部释放的 Promise，用于控制并发测试中事务的进入与完成顺序。 */
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe.skipIf(!enabled)('企业权限真实 PostgreSQL / Redis 集成', () => {
  let adminPool: Pool
  let pool: Pool
  let redis: Redis
  let db: ReturnType<typeof drizzle<typeof schema>>
  let access: AccessService
  let seed: AccessSeedService
  let members: MembersService
  let companies: CompaniesService
  let projects: ProjectsService
  let organizationTemplates: OrganizationTemplatesService
  let organizationUnits: OrganizationUnitsService
  let memberCandidates: MemberCandidatesService
  let globalAccountCandidates: GlobalAccountCandidatesService
  let accounts: AccountsService
  let workspaces: WorkspacesService
  let roles: RolesService
  let menus: MenusService
  let cleanup: PermissionsCleanupService
  let sessions: SessionStoreService
  let platformId: string
  let companyAdminId: string
  let memberId: string
  let replacementId: string
  let company: CompanyDetail
  let project: ProjectDetail
  let member: MemberRecord
  let temporaryDirectory: string
  let companyScope: { type: 'company'; companyId: string }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('真实测试必须提供隔离容器 DATABASE_URL')
    adminPool = new Pool({ connectionString: process.env.DATABASE_URL })
    await adminPool.query(`CREATE DATABASE "${databaseName}"`)
    const connection = new URL(process.env.DATABASE_URL)
    connection.pathname = `/${databaseName}`
    pool = new Pool({ connectionString: connection.toString(), max: 12 })
    db = drizzle(pool, { schema })
    await migrate(db, { migrationsFolder: './drizzle' })
    await migrate(db, { migrationsFolder: './drizzle' })
    redis = new Redis({
      protocol: 2,
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB ?? 0),
      lazyConnect: true,
    })
    await redis.connect()
    sessions = new SessionStoreService(
      redis,
      new ConfigService({ session: { idleTtlMs: 60_000, absoluteTtlMs: 120_000 } }),
    )
    access = new AccessService(db)
    seed = new AccessSeedService(db)
    members = new MembersService(access, seed)
    const administrators = new AdministratorsService(access, members, seed)
    companies = new CompaniesService(access, members, administrators)
    organizationTemplates = new OrganizationTemplatesService(access)
    organizationUnits = new OrganizationUnitsService(access)
    memberCandidates = new MemberCandidatesService(access)
    globalAccountCandidates = new GlobalAccountCandidatesService(access)
    projects = new ProjectsService(
      access,
      members,
      administrators,
      new ProjectOrganizationInitializationService(access, organizationTemplates),
    )
    accounts = new AccountsService(access, members, sessions)
    workspaces = new WorkspacesService(access)
    roles = new RolesService(access)
    menus = new MenusService(access)
    cleanup = new PermissionsCleanupService(access)
    const created = await db
      .insert(schema.users)
      .values(
        ['platform_it', 'company_admin_it', 'ordinary_it', 'replacement_it'].map((account) => ({
          account,
          name: account,
          passwordHash: 'test-only-no-login',
        })),
      )
      .returning()
    platformId = created[0]!.id
    companyAdminId = created[1]!.id
    memberId = created[2]!.id
    replacementId = created[3]!.id
    await seed.initialize('platform_it')
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'codex-access-integration-'))
  }, 30_000)
  afterAll(async () => {
    const results = await Promise.allSettled([
      (async () => {
        if (!redis) return
        try {
          for (const id of [platformId, companyAdminId, memberId, replacementId].filter(Boolean))
            await sessions.revokeAllForUser(id)
        } finally {
          redis.disconnect()
        }
      })(),
      (async () => {
        try {
          if (pool) await pool.end()
        } finally {
          if (adminPool) {
            try {
              await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
            } finally {
              await adminPool.end()
            }
          }
        }
      })(),
      temporaryDirectory
        ? rm(temporaryDirectory, { recursive: true, force: true })
        : Promise.resolve(),
    ])
    delete process.env.ACCESS_DEPLOYMENT_PROOF_FILE
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }, 30_000)

  /** 轮询测试数据库中等待权限咨询锁的连接，确认管理写操作已排队；两秒内未出现则断言失败。 */
  const waitForQueuedManagementWrite = () =>
    expect
      .poll(
        async () => {
          const result = await pool.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE l.locktype = 'advisory' AND NOT l.granted AND l.classid = 7421 AND l.objid = 1 AND a.datname = $1",
            [databaseName],
          )
          return result.rows[0]!.count
        },
        { timeout: 2000, interval: 5 },
      )
      .toBeGreaterThan(0)

  it('幂等初始化不提权其他账号，公开新账号没有工作空间', async () => {
    await expect(seed.initialize('platform_it')).resolves.toMatchObject({
      alreadyInitialized: true,
    })
    await expect(seed.initialize('ordinary_it')).rejects.toMatchObject({
      definition: { code: 'ACCESS.ALREADY_INITIALIZED' },
    })
    expect((await workspaces.workspaces(actor(memberId))).workspaces).toEqual([])
    expect(
      await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, 'access.initialize')),
    ).toHaveLength(1)
  })
  it('创建企业、添加成员、创建项目完整事务；平台身份不等于企业成员', async () => {
    company = (await companies.create({
      actor: actor(platformId),
      body: { name: '集成企业', code: 'integration', administratorUserId: companyAdminId },
    })) as CompanyDetail
    companyScope = { type: 'company', companyId: company.id }
    member = await members.add({
      actor: actor(companyAdminId),
      scope: companyScope,
      body: { account: 'ordinary_it' },
    })
    project = (await projects.create({
      actor: actor(companyAdminId),
      companyId: company.id,
      body: {
        name: '集成项目',
        code: 'project_it',
        administratorUserId: memberId,
        organizationInitialization: { mode: 'blank' },
      },
    })) as ProjectDetail
    const blankTrees = await db
      .select()
      .from(schema.organizationTrees)
      .where(
        and(
          eq(schema.organizationTrees.scopeType, 'project'),
          eq(schema.organizationTrees.companyId, company.id),
          eq(schema.organizationTrees.projectId, project.id),
        ),
      )
    expect(blankTrees).toHaveLength(1)
    expect(
      await db
        .select()
        .from(schema.organizationUnits)
        .where(eq(schema.organizationUnits.treeId, blankTrees[0]!.id)),
    ).toHaveLength(0)
    expect(
      await db.select().from(schema.positions).where(eq(schema.positions.projectId, project.id)),
    ).toHaveLength(0)
    await expect(
      access.read({ actor: actor(platformId), scope: companyScope }, async () => true),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.NOT_FOUND' } })
    const context = await access.read(
      {
        actor: actor(companyAdminId),
        scope: { type: 'project', companyId: company.id, projectId: project.id },
      },
      async (_tx, result) => access.context(result),
    )
    expect(context.administrator).toBe('company')
    expect(
      await db
        .select()
        .from(schema.projectMembers)
        .where(eq(schema.projectMembers.userId, companyAdminId)),
    ).toHaveLength(0)
    await expect(
      projects.create({
        actor: actor(memberId),
        companyId: company.id,
        body: {
          name: '不能创建',
          code: 'forbidden',
          administratorUserId: memberId,
          organizationInitialization: { mode: 'blank' },
        },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.FORBIDDEN' } })
  })
  it('全局账号候选按用途鉴权、稳定区分同名账号并按请求顺序回显', async () => {
    const sharedName = '同名全局候选'
    const [laterAccount, earlierAccount, lockedAccount] = await db
      .insert(schema.users)
      .values([
        {
          account: 'global_candidate_b',
          name: sharedName,
          passwordHash: 'test-only-no-login',
        },
        {
          account: 'global_candidate_a',
          name: sharedName,
          passwordHash: 'test-only-no-login',
        },
        {
          account: 'global_candidate_locked',
          name: sharedName,
          passwordHash: 'test-only-no-login',
          status: 'locked' as const,
        },
      ])
      .returning()
    const read = vi.spyOn(access, 'read')
    const createCandidates = await globalAccountCandidates.search({
      actor: actor(platformId),
      query: { purpose: 'createCompanyAdministrator', query: sharedName, pageSize: 100 },
    })
    const setCandidates = await globalAccountCandidates.search({
      actor: actor(platformId),
      query: { purpose: 'setCompanyAdministrator', query: sharedName, pageSize: 100 },
    })
    expect(read.mock.calls[0]?.[0]).toMatchObject({
      scope: { type: 'platform' },
      permission: 'platform.companies.create',
      adminOnly: true,
    })
    expect(read.mock.calls[1]?.[0]).toMatchObject({
      scope: { type: 'platform' },
      permission: 'platform.companies.administrator',
      adminOnly: true,
    })
    read.mockRestore()
    expect(createCandidates.items.map((item) => item.account)).toEqual([
      'global_candidate_a',
      'global_candidate_b',
      'global_candidate_locked',
    ])
    expect(new Set(createCandidates.items.map((item) => item.userId)).size).toBe(3)
    expect(setCandidates.items).toHaveLength(3)
    expect(createCandidates.items.find((item) => item.userId === lockedAccount!.id)).toMatchObject({
      status: 'locked',
      disabled: true,
      disabledReason: 'accountInactive',
    })
    const resolved = await globalAccountCandidates.resolve({
      actor: actor(platformId),
      body: {
        purpose: 'setCompanyAdministrator',
        userIds: [laterAccount!.id, crypto.randomUUID(), lockedAccount!.id, earlierAccount!.id],
      },
    })
    expect(resolved.map((item) => item.userId)).toEqual([
      laterAccount!.id,
      lockedAccount!.id,
      earlierAccount!.id,
    ])
    expect(resolved[1]).toMatchObject({ disabled: true, disabledReason: 'accountInactive' })
    await expect(
      globalAccountCandidates.search({
        actor: actor(companyAdminId),
        query: { purpose: 'createCompanyAdministrator', query: sharedName },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.FORBIDDEN' } })
  })
  it('岗位成员候选只接受 URL 当前企业或项目作用域内的岗位 ID', async () => {
    const foreignCompany = await companies.create({
      actor: actor(platformId),
      body: {
        name: '候选隔离企业',
        code: 'candidate_isolation_company',
        administratorUserId: replacementId,
      },
    })
    const foreignProject = await projects.create({
      actor: actor(replacementId),
      companyId: foreignCompany.id,
      body: {
        name: '候选隔离项目',
        code: 'candidate_isolation_project',
        administratorUserId: replacementId,
        organizationInitialization: { mode: 'blank' },
      },
    })
    const [companyPosition, projectPosition, foreignCompanyPosition, foreignProjectPosition] =
      await db
        .insert(schema.positions)
        .values([
          {
            scopeType: 'company',
            companyId: company.id,
            name: '候选企业岗位',
            nameKey: '候选企业岗位',
            code: 'candidate_company_position',
            codeKey: 'candidate_company_position',
          },
          {
            scopeType: 'project',
            companyId: company.id,
            projectId: project.id,
            name: '候选项目岗位',
            nameKey: '候选项目岗位',
            code: 'candidate_project_position',
            codeKey: 'candidate_project_position',
          },
          {
            scopeType: 'company',
            companyId: foreignCompany.id,
            name: '候选隔离企业岗位',
            nameKey: '候选隔离企业岗位',
            code: 'candidate_foreign_company_pos',
            codeKey: 'candidate_foreign_company_pos',
          },
          {
            scopeType: 'project',
            companyId: foreignCompany.id,
            projectId: foreignProject.id,
            name: '候选隔离项目岗位',
            nameKey: '候选隔离项目岗位',
            code: 'candidate_foreign_project_pos',
            codeKey: 'candidate_foreign_project_pos',
          },
        ])
        .returning()
    await expect(
      memberCandidates.search({
        actor: actor(companyAdminId),
        scope: companyScope,
        query: { purpose: 'assignPositionMembers', positionIds: [companyPosition!.id] },
      }),
    ).resolves.toMatchObject({ page: 1, pageSize: 20 })
    for (const positionId of [projectPosition!.id, foreignCompanyPosition!.id]) {
      await expect(
        memberCandidates.search({
          actor: actor(companyAdminId),
          scope: companyScope,
          query: { purpose: 'assignPositionMembers', positionIds: [positionId] },
        }),
      ).rejects.toMatchObject({ definition: { code: 'ACCESS.NOT_FOUND' } })
    }
    const projectScope = {
      type: 'project' as const,
      companyId: company.id,
      projectId: project.id,
    }
    await expect(
      memberCandidates.search({
        actor: actor(companyAdminId),
        scope: projectScope,
        query: { purpose: 'assignPositionMembers', positionIds: [projectPosition!.id] },
      }),
    ).resolves.toMatchObject({ page: 1, pageSize: 20 })
    for (const positionId of [companyPosition!.id, foreignProjectPosition!.id]) {
      await expect(
        memberCandidates.search({
          actor: actor(companyAdminId),
          scope: projectScope,
          query: { purpose: 'assignPositionMembers', positionIds: [positionId] },
        }),
      ).rejects.toMatchObject({ definition: { code: 'ACCESS.NOT_FOUND' } })
    }
  })
  it('企业与项目组织负责人可原子交接，双负责人请求和数据库写入仍整批失败', async () => {
    const [oldLeader, newLeader] = await db
      .insert(schema.users)
      .values([
        {
          account: 'organization_old_leader',
          name: '原组织负责人',
          passwordHash: 'test-only-no-login',
        },
        {
          account: 'organization_new_leader',
          name: '新组织负责人',
          passwordHash: 'test-only-no-login',
        },
      ])
      .returning()
    for (const account of [oldLeader!.account, newLeader!.account]) {
      await members.add({
        actor: actor(companyAdminId),
        scope: companyScope,
        body: { account },
      })
      await members.add({
        actor: actor(companyAdminId),
        scope: { type: 'project', companyId: company.id, projectId: project.id },
        body: { account },
      })
    }
    const companyUnit = await organizationUnits.create({
      actor: actor(companyAdminId),
      scope: companyScope,
      body: { name: '企业负责人交接单元', code: 'company_leader_handover' },
    })
    const projectScope = {
      type: 'project' as const,
      companyId: company.id,
      projectId: project.id,
    }
    const projectUnit = await organizationUnits.create({
      actor: actor(companyAdminId),
      scope: projectScope,
      body: { name: '项目负责人交接单元', code: 'project_leader_handover' },
    })

    for (const target of [
      {
        scope: companyScope,
        unitId: companyUnit.id,
        table: schema.companyOrganizationUnitMembers,
      },
      {
        scope: projectScope,
        unitId: projectUnit.id,
        table: schema.projectOrganizationUnitMembers,
      },
    ] as const) {
      await organizationUnits.replaceUnitMembers({
        actor: actor(companyAdminId),
        scope: target.scope,
        unitId: target.unitId,
        body: {
          // 先插入未来负责人，确保旧实现会按危险顺序先尝试升级该行。
          members: [
            { userId: newLeader!.id, duty: 'member' },
            { userId: oldLeader!.id, duty: 'leader' },
          ],
        },
      })
      const swapped = await organizationUnits.replaceUnitMembers({
        actor: actor(companyAdminId),
        scope: target.scope,
        unitId: target.unitId,
        body: {
          members: [
            { userId: newLeader!.id, duty: 'leader' },
            { userId: oldLeader!.id, duty: 'member' },
          ],
        },
      })
      expect(
        Object.fromEntries(swapped.members.map((item) => [item.member.userId, item.duty])),
      ).toEqual({ [newLeader!.id]: 'leader', [oldLeader!.id]: 'member' })
      await expect(
        organizationUnits.replaceUnitMembers({
          actor: actor(companyAdminId),
          scope: target.scope,
          unitId: target.unitId,
          body: {
            members: [
              { userId: newLeader!.id, duty: 'leader' },
              { userId: oldLeader!.id, duty: 'leader' },
            ],
          },
        }),
      ).rejects.toMatchObject({
        definition: { code: 'ACCESS.ORGANIZATION_LEADER_CONFLICT' },
      })
      await expect(
        db
          .update(target.table)
          .set({ duty: 'leader' })
          .where(
            and(
              eq(target.table.organizationUnitId, target.unitId),
              eq(target.table.userId, oldLeader!.id),
            ),
          ),
      ).rejects.toBeTruthy()
      const persisted = await db
        .select({ userId: target.table.userId, duty: target.table.duty })
        .from(target.table)
        .where(eq(target.table.organizationUnitId, target.unitId))
      expect(Object.fromEntries(persisted.map((item) => [item.userId, item.duty]))).toEqual({
        [newLeader!.id]: 'leader',
        [oldLeader!.id]: 'member',
      })
    }
  })
  it('项目按模板复制组织与岗位快照，不复制成员任职或角色，并校验模板版本、状态和企业归属', async () => {
    const template = await organizationTemplates.create({
      actor: actor(companyAdminId),
      companyId: company.id,
      body: {
        name: '标准项目组织',
        description: '用于验证项目初始化快照',
        isDefault: true,
        units: [
          {
            clientKey: 'management',
            parentClientKey: null,
            name: '项目管理部',
            code: 'management',
            description: '模板根节点',
            sort: 10,
          },
          {
            clientKey: 'finance',
            parentClientKey: 'management',
            name: '项目财务组',
            code: 'finance',
            description: '模板子节点',
            sort: 20,
          },
        ],
        positions: [
          {
            name: '项目经理',
            code: 'project_manager',
            description: '启用岗位',
            status: 'active',
          },
          {
            name: '项目资料员',
            code: 'document_controller',
            description: '停用岗位也应按快照复制',
            status: 'disabled',
          },
        ],
      },
    })
    const templateProject = await projects.create({
      actor: actor(companyAdminId),
      companyId: company.id,
      body: {
        name: '模板初始化项目',
        code: 'template_project',
        administratorUserId: memberId,
        organizationInitialization: {
          mode: 'template',
          templateId: template.id,
          templateVersion: template.version,
        },
      },
    })
    const [projectTree] = await db
      .select()
      .from(schema.organizationTrees)
      .where(eq(schema.organizationTrees.projectId, templateProject.id))
    expect(projectTree).toBeDefined()
    const copiedUnits = await db
      .select()
      .from(schema.organizationUnits)
      .where(eq(schema.organizationUnits.treeId, projectTree!.id))
    const copiedPositions = await db
      .select()
      .from(schema.positions)
      .where(eq(schema.positions.projectId, templateProject.id))
    expect(copiedUnits).toHaveLength(template.units.length)
    expect(copiedPositions).toHaveLength(template.positions.length)
    expect(new Set(copiedUnits.map((item) => item.sourceTemplateUnitId))).toEqual(
      new Set(template.units.map((item) => item.id)),
    )
    expect(new Set(copiedPositions.map((item) => item.sourceTemplatePositionId))).toEqual(
      new Set(template.positions.map((item) => item.id)),
    )
    expect(copiedUnits.find((item) => item.code === 'finance')?.parentId).toBe(
      copiedUnits.find((item) => item.code === 'management')?.id,
    )
    expect(
      await db
        .select()
        .from(schema.projectMembers)
        .where(eq(schema.projectMembers.projectId, templateProject.id)),
    ).toMatchObject([{ userId: memberId }])
    expect(
      await db
        .select()
        .from(schema.projectOrganizationUnitMembers)
        .where(eq(schema.projectOrganizationUnitMembers.projectId, templateProject.id)),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.projectPositionMembers)
        .where(eq(schema.projectPositionMembers.projectId, templateProject.id)),
    ).toHaveLength(0)
    const projectRoles = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.projectId, templateProject.id))
    expect(projectRoles).toHaveLength(2)
    expect(projectRoles.every((item) => item.builtin !== null)).toBe(true)

    const replaced = await organizationTemplates.replace({
      actor: actor(companyAdminId),
      companyId: company.id,
      templateId: template.id,
      body: {
        expectedVersion: template.version,
        name: template.name,
        description: '模板已产生下一版本',
        isDefault: true,
        units: [
          {
            clientKey: 'new-root',
            parentClientKey: null,
            name: '新版组织节点',
            code: 'new_root',
            sort: 1,
          },
        ],
        positions: [],
      },
    })
    expect(
      await db
        .select()
        .from(schema.organizationUnits)
        .where(eq(schema.organizationUnits.treeId, projectTree!.id)),
    ).toHaveLength(2)
    await expect(
      projects.create({
        actor: actor(companyAdminId),
        companyId: company.id,
        body: {
          name: '过期模板版本项目',
          code: 'stale_template_project',
          administratorUserId: memberId,
          organizationInitialization: {
            mode: 'template',
            templateId: template.id,
            templateVersion: template.version,
          },
        },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.TEMPLATE_VERSION_CONFLICT' } })
    const disabled = await organizationTemplates.status({
      actor: actor(companyAdminId),
      companyId: company.id,
      templateId: template.id,
      body: { expectedVersion: replaced.version, status: 'disabled' },
    })
    await expect(
      projects.create({
        actor: actor(companyAdminId),
        companyId: company.id,
        body: {
          name: '停用模板项目',
          code: 'disabled_template_project',
          administratorUserId: memberId,
          organizationInitialization: {
            mode: 'template',
            templateId: disabled.id,
            templateVersion: disabled.version,
          },
        },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.TEMPLATE_UNAVAILABLE' } })

    const otherCompany = await companies.create({
      actor: actor(platformId),
      body: {
        name: '模板隔离企业',
        code: 'template_isolation',
        administratorUserId: companyAdminId,
      },
    })
    const foreignTemplate = await organizationTemplates.create({
      actor: actor(companyAdminId),
      companyId: otherCompany.id,
      body: {
        name: '其他企业模板',
        units: [],
        positions: [],
      },
    })
    await expect(
      projects.create({
        actor: actor(companyAdminId),
        companyId: company.id,
        body: {
          name: '跨企业模板项目',
          code: 'foreign_template_project',
          administratorUserId: memberId,
          organizationInitialization: {
            mode: 'template',
            templateId: foreignTemplate.id,
            templateVersion: foreignTemplate.version,
          },
        },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.NOT_FOUND' } })
    expect(
      await db
        .select()
        .from(schema.projects)
        .where(
          inArray(schema.projects.code, [
            'stale_template_project',
            'disabled_template_project',
            'foreign_template_project',
          ]),
        ),
    ).toHaveLength(0)
  })
  it('企业层级按同父规范名称、默认排序和循环规则维护，旧接口不泄漏层级字段', async () => {
    const parent = await companies.create({
      actor: actor(platformId),
      body: {
        name: '层级父企业',
        code: 'hierarchy_parent',
        administratorUserId: replacementId,
        entityType: 'group',
      },
    })
    const firstChild = await companies.create({
      actor: actor(platformId),
      body: {
        name: 'ＡＢＣ 子企业',
        code: 'hierarchy_child_1',
        administratorUserId: replacementId,
        parentCompanyId: parent.id,
      },
    })
    const secondChild = await companies.create({
      actor: actor(platformId),
      body: {
        name: '第二子企业',
        code: 'hierarchy_child_2',
        administratorUserId: replacementId,
        parentCompanyId: parent.id,
      },
    })
    expect(parent).toMatchObject({ parentCompanyId: null, entityType: 'group' })
    expect(firstChild.sort).toBe(1)
    expect(secondChild.sort).toBe(2)
    await expect(
      companies.create({
        actor: actor(platformId),
        body: {
          name: 'ABC 子企业',
          code: 'hierarchy_duplicate_name',
          administratorUserId: replacementId,
          parentCompanyId: parent.id,
        },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.DUPLICATE_RESOURCE' } })
    await expect(
      companies.updateHierarchy({
        actor: actor(platformId),
        companyId: parent.id,
        body: {
          expectedVersion: parent.version,
          parentCompanyId: firstChild.id,
          entityType: parent.entityType,
        },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.ORGANIZATION_CYCLE' } })
    await companies.create({
      actor: actor(platformId),
      body: {
        name: '排序上限子企业',
        code: 'hierarchy_child_max',
        administratorUserId: replacementId,
        parentCompanyId: parent.id,
        sort: 999_999_999,
      },
    })
    await expect(
      companies.create({
        actor: actor(platformId),
        body: {
          name: '无法自动排序子企业',
          code: 'hierarchy_sort_exhausted',
          administratorUserId: replacementId,
          parentCompanyId: parent.id,
        },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.ORGANIZATION_SORT_EXHAUSTED' } })
    const tree = await companies.hierarchyTree({ actor: actor(platformId) })
    expect(
      tree
        .find((item) => item.id === parent.id)
        ?.children.slice(0, 2)
        .map((item) => item.id),
    ).toEqual([firstChild.id, secondChild.id])
    expect(
      await db
        .select()
        .from(schema.organizationTrees)
        .where(eq(schema.organizationTrees.companyId, parent.id)),
    ).toHaveLength(1)
    const oldListRecord = (
      await companies.listCompanies({ actor: actor(platformId), query: { pageSize: 100 } })
    ).items.find((item) => item.id === parent.id)!
    const oldDetail = await companies.get({
      actor: actor(platformId),
      companyId: parent.id,
      platform: true,
    })
    expect(Object.hasOwn(oldListRecord, 'parentCompanyId')).toBe(false)
    expect(Object.hasOwn(oldDetail, 'parentCompanyId')).toBe(false)
    const [hierarchyOperator] = await db
      .insert(schema.users)
      .values({
        account: 'hierarchy_operator',
        name: '企业层级维护员',
        passwordHash: 'test-only-no-login',
      })
      .returning()
    const hierarchyRole = await roles.create({
      actor: actor(platformId),
      scope: { type: 'platform' },
      body: {
        name: '企业层级维护角色',
        permissionKeys: ['platform.companies.read', 'platform.companies.hierarchy'],
      },
    })
    await accounts.accountChange({
      actor: actor(platformId),
      userId: hierarchyOperator!.id,
      body: { roleIds: [hierarchyRole.id] },
    })
    await expect(
      companies.updateHierarchy({
        actor: actor(hierarchyOperator!.id),
        companyId: secondChild.id,
        body: {
          expectedVersion: secondChild.version,
          parentCompanyId: null,
          entityType: 'group',
        },
      }),
    ).resolves.toMatchObject({
      id: secondChild.id,
      parentCompanyId: null,
      entityType: 'group',
    })
  })
  it('项目创建审计失败时项目、角色和成员全部回滚', async () => {
    const before = {
      trees: (await db.select().from(schema.organizationTrees)).length,
      roles: (await db.select().from(schema.roles)).length,
      members: (await db.select().from(schema.projectMembers)).length,
    }
    const failingAudit = vi
      .spyOn(access, 'audit')
      .mockRejectedValueOnce(new Error('transaction audit fixture'))
    await expect(
      projects.create({
        actor: actor(companyAdminId),
        companyId: company.id,
        body: {
          name: '回滚项目',
          code: 'rollback',
          administratorUserId: memberId,
          organizationInitialization: { mode: 'blank' },
        },
      }),
    ).rejects.toThrow('transaction audit fixture')
    failingAudit.mockRestore()
    expect(
      await db.select().from(schema.projects).where(eq(schema.projects.code, 'rollback')),
    ).toHaveLength(0)
    expect(await db.select().from(schema.organizationTrees)).toHaveLength(before.trees)
    expect(await db.select().from(schema.roles)).toHaveLength(before.roles)
    expect(await db.select().from(schema.projectMembers)).toHaveLength(before.members)
  })
  it('同范围唯一、内置角色保护、非法授权与跨企业成员约束', async () => {
    await expect(
      members.add({
        actor: actor(companyAdminId),
        scope: companyScope,
        body: { account: 'ordinary_it' },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.DUPLICATE_RESOURCE' } })
    const builtin = (
      await roles.list({ actor: actor(companyAdminId), scope: companyScope, query: {} })
    ).items.find((r) => r.builtin === 'administrator')!
    await expect(
      roles.change({
        actor: actor(companyAdminId),
        scope: companyScope,
        roleId: builtin.id,
        action: 'delete',
        body: { expectedVersion: builtin.version },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.BUILTIN_ROLE_IMMUTABLE' } })
    await expect(
      roles.create({
        actor: actor(companyAdminId),
        scope: companyScope,
        body: { name: '非法授权', permissionKeys: ['company.projects.create'] },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.INVALID_PERMISSION_SET' } })
    const foreignCompany = (await companies.create({
      actor: actor(platformId),
      body: { name: '另一企业', code: 'foreign_it', administratorUserId: replacementId },
    })) as CompanyDetail
    await expect(
      db
        .insert(schema.projectMembers)
        .values({ companyId: foreignCompany.id, projectId: project.id, userId: replacementId }),
    ).rejects.toBeTruthy()
    await expect(
      members.record(db, { type: 'company', companyId: foreignCompany.id }, member.id),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.NOT_FOUND' } })
  })
  it('公司管理员和自定义角色均受菜单停用，隐藏只影响导航', async () => {
    const tree = await menus.list({ actor: actor(platformId), scopeType: 'company' })
    const page = tree.items.find((m) => m.routeKey === 'company.profile')!
    let changed = await menus.change({
      actor: actor(platformId),
      menuId: page.id,
      action: 'update',
      body: { expectedVersion: tree.version, hidden: true },
    })
    /** 以公司管理员身份重新鉴权并读取当前公司权限上下文，观察菜单修改后的导航和权限变化。 */
    const getContext = () =>
      access.read({ actor: actor(companyAdminId), scope: companyScope }, async (_tx, current) =>
        access.context(current),
      )
    expect((await getContext()).permissionKeys).toContain('company.profile.update')
    expect((await getContext()).menus.some((m) => m.id === page.id)).toBe(false)
    changed = await menus.change({
      actor: actor(platformId),
      menuId: page.id,
      action: 'update',
      body: { expectedVersion: changed.version, status: 'disabled' },
    })
    expect((await getContext()).permissionKeys).not.toContain('company.profile.update')
    await menus.change({
      actor: actor(platformId),
      menuId: page.id,
      action: 'update',
      body: { expectedVersion: changed.version, hidden: false, status: 'active' },
    })
    const platformTree = await menus.list({ actor: actor(platformId), scopeType: 'platform' })
    await expect(
      menus.change({
        actor: actor(platformId),
        menuId: platformTree.items.find((m) => m.routeKey === 'platform.menus')!.id,
        action: 'update',
        body: { expectedVersion: platformTree.version, status: 'disabled' },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.PROTECTED_MENU' } })
  })
  it('停用保留子级状态，移除企业成员清理项目授权且重新加入不恢复', async () => {
    let p = await projects.status({
      actor: actor(companyAdminId),
      companyId: company.id,
      projectId: project.id,
      body: { expectedVersion: project.version, status: 'disabled' },
    })
    let c = await companies.status({
      actor: actor(platformId),
      companyId: company.id,
      body: { expectedVersion: company.version, status: 'disabled' },
    })
    c = await companies.status({
      actor: actor(platformId),
      companyId: company.id,
      body: { expectedVersion: c.version, status: 'active' },
    })
    expect(
      (await projects.project(db, { companyId: company.id, projectId: project.id })).status,
    ).toBe('disabled')
    p = await projects.status({
      actor: actor(companyAdminId),
      companyId: company.id,
      projectId: project.id,
      body: { expectedVersion: p.version, status: 'active' },
    })
    const isolatedCompany = await companies.create({
      actor: actor(platformId),
      body: {
        name: '成员隔离企业',
        code: 'member_isolation',
        administratorUserId: memberId,
      },
    })
    const isolatedProject = await projects.create({
      actor: actor(memberId),
      companyId: isolatedCompany.id,
      body: {
        name: '成员隔离项目',
        code: 'member_isolation_project',
        administratorUserId: memberId,
        organizationInitialization: { mode: 'blank' },
      },
    })
    const trees = await db.select().from(schema.organizationTrees)
    const companyTree = trees.find(
      (item) => item.scopeType === 'company' && item.companyId === company.id,
    )!
    const projectTree = trees.find((item) => item.projectId === project.id)!
    const isolatedCompanyTree = trees.find(
      (item) => item.scopeType === 'company' && item.companyId === isolatedCompany.id,
    )!
    const isolatedProjectTree = trees.find((item) => item.projectId === isolatedProject.id)!
    const [companyUnit, projectUnit, isolatedCompanyUnit, isolatedProjectUnit] = await db
      .insert(schema.organizationUnits)
      .values([
        {
          treeId: companyTree.id,
          name: '原企业组织',
          nameKey: '原企业组织',
          code: 'source_company_unit',
          codeKey: 'source_company_unit',
          sort: 1,
        },
        {
          treeId: projectTree.id,
          name: '原项目组织',
          nameKey: '原项目组织',
          code: 'source_project_unit',
          codeKey: 'source_project_unit',
          sort: 1,
        },
        {
          treeId: isolatedCompanyTree.id,
          name: '隔离企业组织',
          nameKey: '隔离企业组织',
          code: 'isolated_company_unit',
          codeKey: 'isolated_company_unit',
          sort: 1,
        },
        {
          treeId: isolatedProjectTree.id,
          name: '隔离项目组织',
          nameKey: '隔离项目组织',
          code: 'isolated_project_unit',
          codeKey: 'isolated_project_unit',
          sort: 1,
        },
      ])
      .returning()
    const [companyPosition, projectPosition, isolatedCompanyPosition, isolatedProjectPosition] =
      await db
        .insert(schema.positions)
        .values([
          {
            scopeType: 'company',
            companyId: company.id,
            name: '原企业岗位',
            nameKey: '原企业岗位',
            code: 'source_company_position',
            codeKey: 'source_company_position',
          },
          {
            scopeType: 'project',
            companyId: company.id,
            projectId: project.id,
            name: '原项目岗位',
            nameKey: '原项目岗位',
            code: 'source_project_position',
            codeKey: 'source_project_position',
          },
          {
            scopeType: 'company',
            companyId: isolatedCompany.id,
            name: '隔离企业岗位',
            nameKey: '隔离企业岗位',
            code: 'isolated_company_position',
            codeKey: 'isolated_company_position',
          },
          {
            scopeType: 'project',
            companyId: isolatedCompany.id,
            projectId: isolatedProject.id,
            name: '隔离项目岗位',
            nameKey: '隔离项目岗位',
            code: 'isolated_project_position',
            codeKey: 'isolated_project_position',
          },
        ])
        .returning()
    await db.insert(schema.companyOrganizationUnitMembers).values([
      {
        companyId: company.id,
        treeId: companyTree.id,
        organizationUnitId: companyUnit!.id,
        userId: memberId,
        duty: 'leader',
      },
      {
        companyId: isolatedCompany.id,
        treeId: isolatedCompanyTree.id,
        organizationUnitId: isolatedCompanyUnit!.id,
        userId: memberId,
        duty: 'leader',
      },
    ])
    await db.insert(schema.projectOrganizationUnitMembers).values([
      {
        companyId: company.id,
        projectId: project.id,
        treeId: projectTree.id,
        organizationUnitId: projectUnit!.id,
        userId: memberId,
        duty: 'deputy',
      },
      {
        companyId: isolatedCompany.id,
        projectId: isolatedProject.id,
        treeId: isolatedProjectTree.id,
        organizationUnitId: isolatedProjectUnit!.id,
        userId: memberId,
        duty: 'deputy',
      },
    ])
    await db.insert(schema.companyPositionMembers).values([
      { companyId: company.id, positionId: companyPosition!.id, userId: memberId },
      {
        companyId: isolatedCompany.id,
        positionId: isolatedCompanyPosition!.id,
        userId: memberId,
      },
    ])
    await db.insert(schema.projectPositionMembers).values([
      {
        companyId: company.id,
        projectId: project.id,
        positionId: projectPosition!.id,
        userId: memberId,
      },
      {
        companyId: isolatedCompany.id,
        projectId: isolatedProject.id,
        positionId: isolatedProjectPosition!.id,
        userId: memberId,
      },
    ])
    const isolatedRoleAssignments = await db
      .select({ roleId: schema.userRoles.roleId })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(
        and(eq(schema.userRoles.userId, memberId), eq(schema.roles.companyId, isolatedCompany.id)),
      )
    await members.change({
      actor: actor(companyAdminId),
      scope: companyScope,
      memberId: member.id,
      action: 'remove',
      body: { expectedVersion: member.version },
    })
    expect(
      await db
        .select()
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.companyId, company.id),
            eq(schema.projectMembers.userId, memberId),
          ),
        ),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.projectMembers)
        .where(
          and(
            eq(schema.projectMembers.projectId, isolatedProject.id),
            eq(schema.projectMembers.userId, memberId),
          ),
        ),
    ).toHaveLength(1)
    expect(
      await db
        .select()
        .from(schema.companyOrganizationUnitMembers)
        .where(
          and(
            eq(schema.companyOrganizationUnitMembers.companyId, company.id),
            eq(schema.companyOrganizationUnitMembers.userId, memberId),
          ),
        ),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.projectOrganizationUnitMembers)
        .where(
          and(
            eq(schema.projectOrganizationUnitMembers.companyId, company.id),
            eq(schema.projectOrganizationUnitMembers.userId, memberId),
          ),
        ),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.companyPositionMembers)
        .where(
          and(
            eq(schema.companyPositionMembers.companyId, company.id),
            eq(schema.companyPositionMembers.userId, memberId),
          ),
        ),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.projectPositionMembers)
        .where(
          and(
            eq(schema.projectPositionMembers.companyId, company.id),
            eq(schema.projectPositionMembers.userId, memberId),
          ),
        ),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
        .where(and(eq(schema.userRoles.userId, memberId), eq(schema.roles.companyId, company.id))),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.companyOrganizationUnitMembers)
        .where(eq(schema.companyOrganizationUnitMembers.companyId, isolatedCompany.id)),
    ).toHaveLength(1)
    expect(
      await db
        .select()
        .from(schema.projectOrganizationUnitMembers)
        .where(eq(schema.projectOrganizationUnitMembers.projectId, isolatedProject.id)),
    ).toHaveLength(1)
    expect(
      await db
        .select()
        .from(schema.companyPositionMembers)
        .where(eq(schema.companyPositionMembers.companyId, isolatedCompany.id)),
    ).toHaveLength(1)
    expect(
      await db
        .select()
        .from(schema.projectPositionMembers)
        .where(eq(schema.projectPositionMembers.projectId, isolatedProject.id)),
    ).toHaveLength(1)
    expect(
      await db
        .select({ roleId: schema.userRoles.roleId })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
        .where(
          and(
            eq(schema.userRoles.userId, memberId),
            eq(schema.roles.companyId, isolatedCompany.id),
          ),
        ),
    ).toEqual(isolatedRoleAssignments)
    const [removalAudit] = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(eq(schema.auditLogs.action, 'member.remove'), eq(schema.auditLogs.objectId, member.id)),
      )
    expect(removalAudit?.summary).toMatchObject({
      removedOrganizationRelationCount: 2,
      removedPositionAssignmentCount: 2,
    })
    member = await members.add({
      actor: actor(companyAdminId),
      scope: companyScope,
      body: { account: 'ordinary_it' },
    })
    expect(member.roleNames).toEqual(['内置普通成员'])
    project = { ...project, ...p }
    company = { ...company, ...c }
  })
  it('管理写先持锁允许提交，随后撤权；撤权先提交则锁内鉴权拒绝且无成功审计', async () => {
    const custom = await roles.create({
      actor: actor(companyAdminId),
      scope: companyScope,
      body: {
        name: '资料维护员',
        permissionKeys: ['company.profile.read', 'company.profile.update'],
      },
    })
    member = (await members.change({
      actor: actor(companyAdminId),
      scope: companyScope,
      memberId: member.id,
      action: 'roles',
      body: { expectedVersion: member.version, roleIds: [...member.roleIds, custom.id] },
    })) as MemberRecord
    const held = deferred()
    const release = deferred()
    const writeActor = actor(memberId)
    const write = access.write(
      { actor: writeActor, scope: companyScope, permission: 'company.profile.update' },
      async (tx, verified) => {
        held.resolve()
        await release.promise
        await tx
          .update(schema.companies)
          .set({ description: '先持锁写入' })
          .where(eq(schema.companies.id, company.id))
        await access.audit(tx, {
          actor: writeActor,
          access: verified,
          action: 'company.update',
          objectType: 'company',
          objectId: company.id,
        })
      },
    )
    await held.promise
    const revoke = members.change({
      actor: actor(companyAdminId),
      scope: companyScope,
      memberId: member.id,
      action: 'roles',
      body: {
        expectedVersion: member.version,
        roleIds: member.roleIds.filter((id) => id !== custom.id),
      },
    })
    try {
      await waitForQueuedManagementWrite()
    } finally {
      release.resolve()
    }
    await write
    member = (await revoke) as MemberRecord
    expect((await companies.company(db, company.id)).description).toBe('先持锁写入')

    member = (await members.change({
      actor: actor(companyAdminId),
      scope: companyScope,
      memberId: member.id,
      action: 'roles',
      body: { expectedVersion: member.version, roleIds: [...member.roleIds, custom.id] },
    })) as MemberRecord
    const revocationHeld = deferred()
    const releaseRevocation = deferred()
    const revokeActor = actor(companyAdminId)
    const originalAudit = access.audit.bind(access)
    const gateAudit = vi.spyOn(access, 'audit').mockImplementation(async (tx, input) => {
      await originalAudit(tx, input)
      if (input.actor.requestId === revokeActor.requestId) {
        revocationHeld.resolve()
        await releaseRevocation.promise
      }
    })
    const firstRevocation = members.change({
      actor: revokeActor,
      scope: companyScope,
      memberId: member.id,
      action: 'roles',
      body: {
        expectedVersion: member.version,
        roleIds: member.roleIds.filter((id) => id !== custom.id),
      },
    })
    await revocationHeld.promise
    const afterRevocation = actor(memberId)
    const blockedWrite = companies
      .profile({
        actor: afterRevocation,
        companyId: company.id,
        body: { expectedVersion: company.version, description: '不允许写入' },
      })
      .then(
        (result) => ({ result }),
        (error) => ({ error }),
      )
    try {
      await waitForQueuedManagementWrite()
    } finally {
      releaseRevocation.resolve()
    }
    member = (await firstRevocation) as MemberRecord
    expect(await blockedWrite).toMatchObject({
      error: { definition: { code: 'ACCESS.FORBIDDEN' } },
    })
    gateAudit.mockRestore()
    expect((await companies.company(db, company.id)).description).toBe('先持锁写入')
    expect(
      await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.requestId, afterRevocation.requestId)),
    ).toHaveLength(0)
  })
  it('并发停用两位企业管理员只能成功一次', async () => {
    await companies.setAdministrator({
      actor: actor(platformId),
      companyId: company.id,
      body: { administratorUserId: replacementId },
    })
    const currentMembers = (
      await members.list({ actor: actor(companyAdminId), scope: companyScope, query: {} })
    ).items
    const first = currentMembers.find((m) => m.userId === companyAdminId)!
    const second = currentMembers.find((m) => m.userId === replacementId)!
    const results = await Promise.allSettled([
      members.change({
        actor: actor(companyAdminId),
        scope: companyScope,
        memberId: first.id,
        action: 'status',
        body: { expectedVersion: first.version, status: 'disabled' },
      }),
      members.change({
        actor: actor(replacementId),
        scope: companyScope,
        memberId: second.id,
        action: 'status',
        body: { expectedVersion: second.version, status: 'disabled' },
      }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    await companies.setAdministrator({
      actor: actor(platformId),
      companyId: company.id,
      body: { administratorUserId: companyAdminId },
    })
    await companies.setAdministrator({
      actor: actor(platformId),
      companyId: company.id,
      body: { administratorUserId: replacementId },
    })
  })
  it('账号禁用允许平台补任更换，旧会话撤销、恢复不恢复旧管理员角色', async () => {
    const tokenDigest = randomBytes(32).toString('hex')
    await sessions.createOrReplace({
      tokenDigest,
      userId: companyAdminId,
      terminal: 'desktop',
      loginIp: '127.0.0.1',
      userAgent: 'test',
    })
    expect(await sessions.validateAndTouch(tokenDigest)).toMatchObject({
      userId: companyAdminId,
      terminal: 'desktop',
    })
    await accounts.accountChange({
      actor: actor(platformId),
      userId: companyAdminId,
      body: { status: 'disabled' },
    })
    expect(await sessions.validateAndTouch(tokenDigest)).toBeNull()
    await companies.setAdministrator({
      actor: actor(platformId),
      companyId: company.id,
      body: { administratorUserId: replacementId, replaceUserId: companyAdminId },
    })
    await accounts.accountChange({
      actor: actor(platformId),
      userId: companyAdminId,
      body: { status: 'active' },
    })
    expect(await access.isAdministrator(db, companyScope, companyAdminId)).toBe(false)
    expect(await sessions.validateAndTouch(tokenDigest)).toBeNull()
    const platformDigest = randomBytes(32).toString('hex')
    await sessions.createOrReplace({
      tokenDigest: platformDigest,
      userId: platformId,
      terminal: 'desktop',
      loginIp: '127.0.0.1',
      userAgent: 'test',
    })
    await expect(
      accounts.accountChange({
        actor: actor(platformId),
        userId: platformId,
        body: { status: 'disabled' },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.LAST_ADMINISTRATOR' } })
    expect(await sessions.validateAndTouch(platformDigest)).toMatchObject({ userId: platformId })
    await companies.setAdministrator({
      actor: actor(platformId),
      companyId: company.id,
      body: { administratorUserId: companyAdminId },
    })
  })
  it('账号停用审计失败回滚时保留账号状态和现有会话', async () => {
    const tokenDigest = randomBytes(32).toString('hex')
    await sessions.createOrReplace({
      tokenDigest,
      userId: memberId,
      terminal: 'desktop',
      loginIp: '127.0.0.1',
      userAgent: 'test',
    })
    const auditFailure = vi
      .spyOn(access, 'audit')
      .mockRejectedValueOnce(new Error('account audit rollback fixture'))
    await expect(
      accounts.accountChange({
        actor: actor(platformId),
        userId: memberId,
        body: { status: 'disabled' },
      }),
    ).rejects.toThrow('account audit rollback fixture')
    auditFailure.mockRestore()
    expect((await accounts.accountRecord(db, memberId)).status).toBe('active')
    expect(await sessions.validateAndTouch(tokenDigest)).toMatchObject({ userId: memberId })
  })
  it('登录用户行共享锁与禁用排他锁协调，禁用完成后不会残留登录会话', async () => {
    const repository = new AuthRepository(db)
    const held = deferred()
    const release = deferred()
    const tokenDigest = randomBytes(32).toString('hex')
    const login = repository.withActiveUserLock(memberId, async () => {
      held.resolve()
      await release.promise
      return sessions.createOrReplace({
        tokenDigest,
        userId: memberId,
        terminal: 'desktop',
        loginIp: '127.0.0.1',
        userAgent: 'test',
      })
    })
    await held.promise
    const disable = accounts.accountChange({
      actor: actor(platformId),
      userId: memberId,
      body: { status: 'disabled' },
    })
    release.resolve()
    await login
    await disable
    expect(await sessions.validateAndTouch(tokenDigest)).toBeNull()
    expect(await repository.withActiveUserLock(memberId, async () => true)).toBeNull()
    await accounts.accountChange({
      actor: actor(platformId),
      userId: memberId,
      body: { status: 'active' },
    })
  })
  it('清理重新核验部署与子项，审计失败全回滚，幂等/tombstone与种子不复活', async () => {
    const fixture = ACCESS_PERMISSION_CATALOG.filter((p) => p.routeKey === 'company.fixture')
    fixture.find((p) => p.kind === 'page')!.deprecated = true
    expect(
      (await cleanup.preview(actor(platformId))).items.find(
        (p) => p.permissionKey === 'company.fixture.read',
      )?.blockedReasons,
    ).toContain('存在非废弃子节点')
    for (const p of fixture) p.deprecated = true
    await db.transaction(async (tx) => {
      await lockAccess(tx)
      await seed.sync(tx)
    })
    const proofPath = join(temporaryDirectory, 'deployment-proof.json')
    process.env.ACCESS_DEPLOYMENT_PROOF_FILE = proofPath
    /** 根据当前未废弃权限目录生成一分钟内有效的部署证明，供清理接口复核服务依赖。 */
    const makeProof = () => ({
      deploymentId: 'integration-deployment',
      completed: true,
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      serviceVersions: [
        {
          version: process.env.ACCESS_RELEASE_VERSION ?? ACCESS_CATALOG_VERSION,
          instanceIds: ['isolated-test-instance'],
          requiredPermissionKeys: ACCESS_PERMISSION_CATALOG.filter((p) => !p.deprecated).map(
            (p) => p.key,
          ),
        },
      ],
    })
    await writeFile(proofPath, JSON.stringify(makeProof()))
    const activePreview = await cleanup.preview(actor(platformId))
    expect(activePreview.eligible).toBe(false)
    const tree = await menus.list({ actor: actor(platformId), scopeType: 'company' })
    const page = tree.items.find((m) => m.routeKey === 'company.fixture')!
    let version = tree.version
    for (const row of [page, ...page.children]) {
      const result = await menus.change({
        actor: actor(platformId),
        menuId: row.id,
        action: 'update',
        body: { expectedVersion: version, status: 'disabled' },
      })
      version = result.version
    }
    let preview = await cleanup.preview(actor(platformId))
    expect(preview.eligible).toBe(true)
    const expiredProof = { ...makeProof(), expiresAt: new Date(Date.now() - 1000).toISOString() }
    await writeFile(proofPath, JSON.stringify(expiredProof))
    await expect(
      cleanup.cleanup(actor(platformId), {
        permissionKeys: fixture.map((p) => p.key),
        proofDigest: preview.proofDigest!,
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.CLEANUP_BLOCKED' } })
    const dependentProof = makeProof()
    dependentProof.serviceVersions.push({
      version: 'still-running-old-version',
      instanceIds: ['isolated-old-instance'],
      requiredPermissionKeys: fixture.map((p) => p.key),
    })
    await writeFile(proofPath, JSON.stringify(dependentProof))
    const dependentPreview = await cleanup.preview(actor(platformId))
    expect(
      dependentPreview.items.every((p) => p.blockedReasons.includes('在用服务版本仍依赖此权限')),
    ).toBe(true)
    await expect(
      cleanup.cleanup(actor(platformId), {
        permissionKeys: fixture.map((p) => p.key),
        proofDigest: dependentPreview.proofDigest!,
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.CLEANUP_BLOCKED' } })
    const validProofText = JSON.stringify(makeProof())
    await writeFile(proofPath, validProofText)
    preview = await cleanup.preview(actor(platformId))
    await writeFile(proofPath, `${validProofText}\n`)
    await expect(
      cleanup.cleanup(actor(platformId), {
        permissionKeys: fixture.map((p) => p.key),
        proofDigest: preview.proofDigest!,
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.CLEANUP_BLOCKED' } })
    preview = await cleanup.preview(actor(platformId))
    await expect(
      cleanup.cleanup(actor(platformId), {
        permissionKeys: ['company.fixture.read'],
        proofDigest: preview.proofDigest!,
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.RESOURCE_IN_USE' } })
    const body = { permissionKeys: fixture.map((p) => p.key), proofDigest: preview.proofDigest! }
    const auditFailure = vi
      .spyOn(access, 'audit')
      .mockRejectedValueOnce(new Error('cleanup rollback fixture'))
    await expect(cleanup.cleanup(actor(platformId), body)).rejects.toThrow(
      'cleanup rollback fixture',
    )
    auditFailure.mockRestore()
    expect(
      await db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.key, 'company.fixture.read')),
    ).toHaveLength(1)
    expect(await db.select().from(schema.cleanupTombstones)).toHaveLength(0)
    const result = await cleanup.cleanup(actor(platformId), body)
    expect(result.removedPermissionKeys).toHaveLength(2)
    expect(
      (await cleanup.cleanup(actor(platformId), body)).alreadyCleanedPermissionKeys,
    ).toHaveLength(2)
    await seed.onModuleInit()
    expect(
      await db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.key, 'company.fixture.read')),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.rolePermissions)
        .where(eq(schema.rolePermissions.permissionKey, 'company.fixture.read')),
    ).toHaveLength(0)
  })
  it('菜单乐观版本、数据库版本约束和审计白名单保持有效', async () => {
    const tree = await menus.list({ actor: actor(platformId), scopeType: 'company' })
    await expect(
      menus.create({
        actor: actor(platformId),
        scopeType: 'company',
        body: {
          type: 'directory',
          parentId: null,
          name: '过期目录',
          expectedVersion: tree.version - 1,
        },
      }),
    ).rejects.toMatchObject({ definition: { code: 'ACCESS.VERSION_CONFLICT' } })
    await expect(
      db.update(schema.companies).set({ version: 0 }).where(eq(schema.companies.id, company.id)),
    ).rejects.toBeTruthy()
    const audits = await db.select().from(schema.auditLogs)
    expect(audits.length).toBeGreaterThan(15)
    expect(JSON.stringify(audits)).not.toMatch(/passwordHash|password_hash|accessToken|tokenDigest/)
  })
  it('初始化后发布新功能仅扩展同范围内置管理员，保持其他授权与菜单定制', async () => {
    const upgradePermissions: PermissionDefinition[] = [
      {
        key: 'company.upgrade_fixture.read',
        scopeType: 'company',
        kind: 'page',
        title: '升级新增页面',
        routeKey: 'company.upgrade_fixture',
        pagePermissionKey: null,
        adminOnly: false,
        deprecated: false,
      },
      {
        key: 'company.upgrade_fixture.update',
        scopeType: 'company',
        kind: 'operation',
        title: '升级新增操作',
        routeKey: 'company.upgrade_fixture',
        pagePermissionKey: 'company.upgrade_fixture.read',
        adminOnly: false,
        deprecated: false,
      },
    ]
    const upgradeKeys = upgradePermissions.map((permission) => permission.key)
    expect(await db.select().from(schema.accessBootstrap)).toHaveLength(1)
    expect(
      ACCESS_PERMISSION_CATALOG.some((permission) => upgradeKeys.includes(permission.key)),
    ).toBe(false)
    expect(
      await db
        .select()
        .from(schema.permissions)
        .where(inArray(schema.permissions.key, upgradeKeys)),
    ).toHaveLength(0)

    const custom = await roles.create({
      actor: actor(companyAdminId),
      scope: companyScope,
      body: { name: '升级保留角色', permissionKeys: ['company.profile.read'] },
    })
    const existingMember = await members.record(db, companyScope, member.id)
    await members.change({
      actor: actor(companyAdminId),
      scope: companyScope,
      memberId: existingMember.id,
      action: 'roles',
      body: {
        expectedVersion: existingMember.version,
        roleIds: [...existingMember.roleIds, custom.id],
      },
    })
    const tree = await menus.list({ actor: actor(platformId), scopeType: 'company' })
    const profile = tree.items.find((item) => item.routeKey === 'company.profile')!
    const withDirectory = await menus.create({
      actor: actor(platformId),
      scopeType: 'company',
      body: {
        expectedVersion: tree.version,
        type: 'directory',
        parentId: null,
        name: '升级保留目录',
        sort: 432,
      },
    })
    const directory = withDirectory.items.find((item) => item.name === '升级保留目录')!
    await menus.change({
      actor: actor(platformId),
      menuId: profile.id,
      action: 'update',
      body: {
        expectedVersion: withDirectory.version,
        parentId: directory.id,
        name: '升级前自定义资料页',
        icon: ACCESS_ICON_NAMES[0]!,
        sort: 987,
        hidden: true,
        status: 'disabled',
      },
    })

    /** 按稳定顺序读取角色、授权、菜单和版本，供验证种子升级保留已有配置且只增加预期数据。 */
    const snapshot = async () => ({
      roles: await db.select().from(schema.roles).orderBy(schema.roles.id),
      grants: await db
        .select()
        .from(schema.rolePermissions)
        .orderBy(schema.rolePermissions.roleId, schema.rolePermissions.permissionKey),
      assignments: await db
        .select()
        .from(schema.userRoles)
        .orderBy(schema.userRoles.userId, schema.userRoles.roleId),
      menus: await db.select().from(schema.menus).orderBy(schema.menus.id),
      menuVersions: await db
        .select()
        .from(schema.menuVersions)
        .orderBy(schema.menuVersions.scopeType),
    })
    const before = await snapshot()
    // 此时数据库和全部内置角色已初始化，之后才模拟新版服务发布目录。
    ;(ACCESS_PERMISSION_CATALOG as PermissionDefinition[]).push(...upgradePermissions)
    await seed.onModuleInit()
    const after = await snapshot()

    expect(after.roles.map((role) => role.id)).toEqual(before.roles.map((role) => role.id))
    for (const role of before.roles) {
      const previousKeys = before.grants
        .filter((grant) => grant.roleId === role.id)
        .map((grant) => grant.permissionKey)
      const nextKeys = after.grants
        .filter((grant) => grant.roleId === role.id)
        .map((grant) => grant.permissionKey)
      const receivesUpgrade = role.scopeType === 'company' && role.builtin === 'administrator'
      expect(nextKeys).toEqual([...previousKeys, ...(receivesUpgrade ? upgradeKeys : [])].sort())
      const nextRole = after.roles.find((candidate) => candidate.id === role.id)!
      if (receivesUpgrade) expect(nextRole.version).toBe(role.version + 1)
      else expect(nextRole).toEqual(role)
    }
    expect(after.assignments).toEqual(before.assignments)
    expect(
      after.menus.filter((item) => before.menus.some((previous) => previous.id === item.id)),
    ).toEqual(before.menus)
    const addedMenus = after.menus.filter(
      (item) => item.permissionKey && upgradeKeys.includes(item.permissionKey),
    )
    expect(addedMenus).toHaveLength(2)
    const addedPage = addedMenus.find((item) => item.type === 'page')!
    expect(addedPage.permissionKey).toBe('company.upgrade_fixture.read')
    expect(addedMenus.find((item) => item.type === 'operation')).toMatchObject({
      permissionKey: 'company.upgrade_fixture.update',
      parentId: addedPage.id,
    })
    for (const previous of before.menuVersions) {
      expect(
        after.menuVersions.find((version) => version.scopeType === previous.scopeType)?.version,
      ).toBe(previous.version + (previous.scopeType === 'company' ? 2 : 0))
    }
    expect(
      await db
        .select()
        .from(schema.permissions)
        .where(inArray(schema.permissions.key, upgradeKeys)),
    ).toHaveLength(2)
    const adminContext = await access.read(
      { actor: actor(companyAdminId), scope: companyScope },
      async (_tx, current) => access.context(current),
    )
    const memberContext = await access.read(
      { actor: actor(memberId), scope: companyScope },
      async (_tx, current) => access.context(current),
    )
    expect(adminContext.permissionKeys).toEqual(expect.arrayContaining(upgradeKeys))
    expect(memberContext.permissionKeys.some((key) => upgradeKeys.includes(key))).toBe(false)

    await seed.onModuleInit()
    expect(await snapshot()).toEqual(after)
  })
})
