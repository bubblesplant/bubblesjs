import { describe, expect, it } from 'vite-plus/test'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const enabled = process.env.RUN_ACCESS_INTEGRATION === 'true'
const migrationFolder = join(process.cwd(), 'drizzle')
type Journal = { entries: { idx: number; tag: string; when: number }[] }

/** 只创建随机本机临时数据库，结束后删除本用例创建的库和临时迁移文件。 */
async function withDatabase(run: (pool: Pool, temporary: string) => Promise<void>) {
  const connection = new URL(process.env.DATABASE_URL!)
  if (!['localhost', '127.0.0.1'].includes(connection.hostname))
    throw new Error('只允许本机隔离迁移测试')
  const name = `p0_migration_${crypto.randomUUID().replaceAll('-', '')}`
  const admin = new Pool({ connectionString: connection.toString() })
  let pool: Pool | undefined
  let temporary: string | undefined
  let created = false
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
    created = true
    connection.pathname = `/${name}`
    pool = new Pool({ connectionString: connection.toString() })
    temporary = await mkdtemp(join(tmpdir(), 'codex-p0-migrations-'))
    await run(pool, temporary)
  } finally {
    try {
      await pool?.end()
      if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
    } finally {
      await admin.end()
      if (temporary) await rm(temporary, { recursive: true, force: true })
    }
  }
}

/** 从有效迁移清单复制某一历史检查点，避免修改正式 SQL 或 journal。 */
async function migrateThrough(input: { pool: Pool; temporary: string; index: number }) {
  const folder = join(input.temporary, `through-${input.index}`)
  await mkdir(join(folder, 'meta'), { recursive: true })
  const journal: Journal = JSON.parse(
    await readFile(join(migrationFolder, 'meta/_journal.json'), 'utf8'),
  )
  journal.entries = journal.entries.filter((entry) => entry.idx <= input.index)
  await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal))
  for (const entry of journal.entries)
    await copyFile(join(migrationFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`))
  await migrate(drizzle(input.pool), { migrationsFolder: folder })
}

/** 在组织迁移前建立企业和项目，以验证历史补树及前向清理保留业务数据。 */
async function seedLegacy(pool: Pool) {
  const company = await pool.query(
    "INSERT INTO companies (name, code) VALUES ('迁移测试企业', 'p0_migration') RETURNING id",
  )
  await pool.query(
    "INSERT INTO projects (company_id, name, code) VALUES ($1, '迁移测试项目', 'p0_project')",
    [company.rows[0].id],
  )
  return company.rows[0].id as string
}

/** 读取所有存量业务列，仅排除本次明确取消的四个企业字段。 */
async function businessSnapshot(pool: Pool) {
  const result: Record<string, unknown> = {}
  for (const table of ['companies', 'projects', 'organization_trees', 'organization_units']) {
    const projection =
      table === 'companies'
        ? "to_jsonb(t) - ARRAY['parent_company_id', 'entity_type', 'name_key', 'sort']"
        : 'to_jsonb(t)'
    result[table] = (
      await pool.query(`SELECT ${projection} AS data FROM ${table} t ORDER BY id`)
    ).rows
  }
  return result
}

/** 建立旧层级权限及无关菜单和角色授权，验证精确清理和版本失效。 */
async function seedLegacyPermission(pool: Pool) {
  await pool.query(`INSERT INTO permissions (key, scope_type, title, route_key, kind, page_permission_key) VALUES
    ('platform.companies.page', 'platform', '企业管理', 'platform.companies', 'page', NULL),
    ('platform.companies.hierarchy', 'platform', '旧企业层级', 'platform.companies', 'operation', 'platform.companies.page'),
    ('platform.companies.update', 'platform', '编辑企业', 'platform.companies', 'operation', 'platform.companies.page')`)
  const page = (
    await pool.query(
      "INSERT INTO menus (scope_type, type, name, route_key, permission_key) VALUES ('platform', 'page', '企业管理', 'platform.companies', 'platform.companies.page') RETURNING id",
    )
  ).rows[0].id
  await pool.query(
    "INSERT INTO menus (scope_type, parent_id, type, name, permission_key) VALUES ('platform', $1, 'operation', '旧企业层级', 'platform.companies.hierarchy'), ('platform', $1, 'operation', '编辑企业', 'platform.companies.update')",
    [page],
  )
  const affected = (
    await pool.query(
      "INSERT INTO roles (scope_type, name, version) VALUES ('platform', '受影响角色', 4) RETURNING id",
    )
  ).rows[0].id
  const untouched = (
    await pool.query(
      "INSERT INTO roles (scope_type, name, version) VALUES ('platform', '保留角色', 9) RETURNING id",
    )
  ).rows[0].id
  await pool.query(
    "INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, 'platform.companies.hierarchy'), ($1, 'platform.companies.update'), ($2, 'platform.companies.update')",
    [affected, untouched],
  )
  await pool.query("INSERT INTO menu_versions (scope_type, version) VALUES ('platform', 7)")
  return { affected: affected as string, untouched: untouched as string }
}

/** 保存权限配置的完整行，供成功保留与失败回滚比对。 */
async function permissionSnapshot(pool: Pool) {
  const result: Record<string, unknown> = {}
  for (const table of [
    'permissions',
    'menus',
    'roles',
    'role_permissions',
    'menu_versions',
    'permission_cleanup_tombstones',
  ]) {
    result[table] = (
      await pool.query(`SELECT to_jsonb(t) AS data FROM ${table} t ORDER BY to_jsonb(t)::text`)
    ).rows
  }
  return result
}

describe.skipIf(!enabled)('独立企业前向迁移真实 PostgreSQL 验证', () => {
  it('空库完整迁移可重复执行，邀请迁移不在有效链，菜单图标迁移保留', async () => {
    await withDatabase(async (pool) => {
      const db = drizzle(pool)
      await migrate(db, { migrationsFolder: migrationFolder })
      await migrate(db, { migrationsFolder: migrationFolder })
      const journal: Journal = JSON.parse(
        await readFile(join(migrationFolder, 'meta/_journal.json'), 'utf8'),
      )
      expect(journal.entries.map((entry) => entry.idx)).toEqual([0, 1, 2, 3, 5, 6])
      const applied = await pool.query(
        'SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at',
      )
      expect(applied.rows.map((row) => row.created_at)).toEqual(
        journal.entries.map((entry) => String(entry.when)),
      )
      const columns = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'companies'",
      )
      const compareNames = (left: string, right: string) => left.localeCompare(right)
      expect(columns.rows.map((row) => row.column_name).sort(compareNames)).toEqual(
        ['id', 'name', 'code', 'description', 'status', 'version', 'created_at', 'updated_at'].sort(
          compareNames,
        ),
      )
      expect(
        (await pool.query("SELECT to_regclass('public.company_member_invitations') AS invitations"))
          .rows[0].invitations,
      ).toBeNull()
      expect(
        (await pool.query("SELECT 1 FROM pg_type WHERE typname = 'company_entity_type'")).rowCount,
      ).toBe(0)
    })
  }, 30_000)

  it('从已应用 0003 升级保留企业、项目、组织树和非空组织数据，并解除企业同名限制', async () => {
    await withDatabase(async (pool, temporary) => {
      await migrateThrough({ pool, temporary, index: 2 })
      const companyId = await seedLegacy(pool)
      await migrateThrough({ pool, temporary, index: 3 })
      await pool.query(
        "INSERT INTO organization_units (tree_id, name, name_key, code, code_key, sort) SELECT id, '已有组织', '已有组织', 'existing_unit', 'existing_unit', 0 FROM organization_trees WHERE company_id = $1 AND scope_type = 'company'",
        [companyId],
      )
      const before = await businessSnapshot(pool)
      await migrate(drizzle(pool), { migrationsFolder: migrationFolder })
      expect(await businessSnapshot(pool)).toEqual(before)
      await pool.query(
        "INSERT INTO companies (name, code) VALUES ('迁移测试企业', 'p0_duplicate_name')",
      )
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM companies WHERE name = '迁移测试企业'",
          )
        ).rows[0].count,
      ).toBe(2)
    })
  }, 30_000)

  it('只清理旧层级权限、菜单及授权，递增受影响版本并保留无关配置', async () => {
    await withDatabase(async (pool, temporary) => {
      await migrateThrough({ pool, temporary, index: 5 })
      const { affected, untouched } = await seedLegacyPermission(pool)
      const before = await permissionSnapshot(pool)
      await migrate(drizzle(pool), { migrationsFolder: migrationFolder })
      expect(
        (await pool.query("SELECT 1 FROM permissions WHERE key = 'platform.companies.hierarchy'"))
          .rowCount,
      ).toBe(0)
      expect(
        (
          await pool.query(
            "SELECT 1 FROM menus WHERE permission_key = 'platform.companies.hierarchy'",
          )
        ).rowCount,
      ).toBe(0)
      expect(
        (
          await pool.query(
            "SELECT 1 FROM role_permissions WHERE permission_key = 'platform.companies.hierarchy'",
          )
        ).rowCount,
      ).toBe(0)
      expect(
        (await pool.query('SELECT version FROM roles WHERE id = $1', [affected])).rows[0].version,
      ).toBe(5)
      expect(
        (await pool.query('SELECT version FROM roles WHERE id = $1', [untouched])).rows[0].version,
      ).toBe(9)
      expect(
        (await pool.query("SELECT version FROM menu_versions WHERE scope_type = 'platform'"))
          .rows[0].version,
      ).toBe(8)
      expect(
        (
          await pool.query(
            "SELECT deployment_id FROM permission_cleanup_tombstones WHERE permission_key = 'platform.companies.hierarchy'",
          )
        ).rows[0].deployment_id,
      ).toBe('migration:0006_independent_companies')
      const after = await permissionSnapshot(pool)
      for (const table of ['permissions', 'menus', 'role_permissions'] as const) {
        const oldRows = before[table] as { data: Record<string, unknown> }[]
        expect(after[table]).toEqual(
          oldRows.filter(
            (row) =>
              row.data.key !== 'platform.companies.hierarchy' &&
              row.data.permission_key !== 'platform.companies.hierarchy',
          ),
        )
      }
      await migrate(drizzle(pool), { migrationsFolder: migrationFolder })
      expect(await permissionSnapshot(pool)).toEqual(after)
    })
  }, 30_000)

  it.each(['hierarchy', 'invitation', 'menu-child'] as const)(
    '发现存量 %s 时整批中止，保留旧字段和数据',
    async (kind) => {
      await withDatabase(async (pool, temporary) => {
        await migrateThrough({ pool, temporary, index: 2 })
        const companyId = await seedLegacy(pool)
        await migrateThrough({ pool, temporary, index: 3 })
        await seedLegacyPermission(pool)
        if (kind === 'hierarchy') {
          await pool.query(
            "INSERT INTO companies (name, name_key, code, parent_company_id) VALUES ('存量子企业', '存量子企业', 'p0_child', $1)",
            [companyId],
          )
        } else if (kind === 'invitation') {
          await pool.query('CREATE TABLE company_member_invitations (id uuid PRIMARY KEY)')
          await pool.query('INSERT INTO company_member_invitations VALUES ($1)', [
            crypto.randomUUID(),
          ])
        } else {
          await pool.query(
            "UPDATE menus SET parent_id = (SELECT id FROM menus WHERE permission_key = 'platform.companies.hierarchy') WHERE permission_key = 'platform.companies.update'",
          )
        }
        const before = await businessSnapshot(pool)
        const permissionsBefore = await permissionSnapshot(pool)
        await expect(
          migrate(drizzle(pool), { migrationsFolder: migrationFolder }),
        ).rejects.toMatchObject({
          cause: { message: expect.stringContaining('企业独立化迁移已终止') },
        })
        expect(await businessSnapshot(pool)).toEqual(before)
        expect(await permissionSnapshot(pool)).toEqual(permissionsBefore)
        const applied = await pool.query(
          'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations',
        )
        expect(applied.rows[0].count).toBe(4)
        const columns = await pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'companies' AND column_name IN ('parent_company_id','entity_type','name_key','sort')",
        )
        expect(columns.rowCount).toBe(4)
        if (kind === 'invitation')
          expect(
            (await pool.query('SELECT count(*)::int AS count FROM company_member_invitations'))
              .rows[0].count,
          ).toBe(1)
      })
    },
    30_000,
  )
})
