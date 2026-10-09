import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { ConfigService } from '@nestjs/config'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import Redis from 'ioredis'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import * as schema from '@/database/schema'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import { AccessService } from '@/modules/access/access.service'
import { AccessSeedService } from '@/modules/access/seed/access-seed.service'
import { AUTH_ERRORS } from '@/modules/auth/auth.errors'
import { AuthRepository } from '@/modules/auth/auth.repository'
import { AuthService } from '@/modules/auth/auth.service'
import { PasswordService } from '@/modules/auth/password.service'
import { SessionStoreService } from '@/modules/auth/session/session-store.service'
import { SessionTokenService } from '@/modules/auth/session/session-token.service'
import { AccountPasswordResetService } from '@/modules/members/accounts/password-reset/password-reset.service'
import type { SessionTerminalType } from 'shared/types'

const enabled = process.env.RUN_PASSWORD_INTEGRATION === 'true'
const databaseName = `password_it_${randomUUID().replaceAll('-', '')}`
const originalPassword = 'qaOld12345'
const changedPassword = 'qaNew12345'
const resetPassword = 'qaReset123'
const terminals: SessionTerminalType[] = ['web', 'mobile', 'desktop']

describe.skipIf(!enabled)('密码操作真实 PostgreSQL / Redis 集成', () => {
  let adminPool: Pool
  let pool: Pool
  let redis: Redis
  let db: ReturnType<typeof drizzle<typeof schema>>
  let passwords: PasswordService
  let sessions: SessionStoreService
  let tokens: SessionTokenService
  let auth: AuthService
  let reset: AccountPasswordResetService
  let admin: typeof schema.users.$inferSelect
  const userIds: string[] = []

  /** 仅允许对本机开发容器创建随机数据库，并使用独立 Redis 逻辑库。 */
  function assertIsolatedEnvironment(): string {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('缺少隔离测试 DATABASE_URL')
    const url = new URL(connectionString)
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.port !== '5432' ||
      url.pathname !== '/postgres' ||
      !['127.0.0.1', 'localhost'].includes(process.env.REDIS_HOST ?? '') ||
      process.env.REDIS_PORT !== '6379' ||
      process.env.REDIS_DB !== '15'
    ) {
      throw new Error('拒绝运行：仅允许本机开发容器和 Redis DB 15')
    }
    return connectionString
  }

  /** 在随机临时数据库中创建没有工作空间关系的账号。 */
  async function createUser(label: string) {
    const account = `pwit_${label}_${randomUUID().replaceAll('-', '').slice(0, 10)}`
    const [user] = await db
      .insert(schema.users)
      .values({ account, name: label, passwordHash: await passwords.hash(originalPassword) })
      .returning()
    userIds.push(user!.id)
    return user!
  }

  /** 在真实 Redis 中建立同一账号的三个终端会话，并返回不含明文令牌的摘要。 */
  async function createTerminalSessions(userId: string) {
    const digests: string[] = []
    for (const terminal of terminals) {
      const { tokenDigest } = tokens.createToken()
      await sessions.createOrReplace({
        userId,
        terminal,
        tokenDigest,
        loginIp: '127.0.0.1',
        userAgent: `integration-${terminal}`,
      })
      digests.push(tokenDigest)
    }
    return digests
  }

  /** 读取当前账号摘要，用于确认真实数据库事务已提交或回滚。 */
  async function passwordHash(userId: string) {
    const [user] = await db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
    return user!.passwordHash
  }

  /** 检查测试创建的全部终端令牌是否仍能通过真实 Redis Lua 校验。 */
  async function expectSessions(digests: string[], userId: string, valid: boolean) {
    for (const [index, digest] of digests.entries()) {
      const current = await sessions.validateAndTouch(digest)
      if (valid) expect(current).toEqual({ userId, terminal: terminals[index] })
      else expect(current).toBeNull()
    }
  }

  beforeAll(async () => {
    const connectionString = assertIsolatedEnvironment()
    adminPool = new Pool({ connectionString })
    await adminPool.query(`CREATE DATABASE "${databaseName}"`)
    const testUrl = new URL(connectionString)
    testUrl.pathname = `/${databaseName}`
    pool = new Pool({ connectionString: testUrl.toString(), max: 6 })
    db = drizzle(pool, { schema })
    await migrate(db, { migrationsFolder: './drizzle' })

    redis = new Redis({
      protocol: 2,
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
      db: 15,
      lazyConnect: true,
    })
    await redis.connect()
    const config = new ConfigService({
      session: {
        idleTtlMs: 60_000,
        absoluteTtlMs: 120_000,
        tokenPepper: 'integration-only-token-pepper-32-bytes',
      },
    })
    passwords = new PasswordService()
    sessions = new SessionStoreService(redis, config)
    tokens = new SessionTokenService(config)
    auth = new AuthService(new AuthRepository(db), passwords, tokens, sessions, config)
    const access = new AccessService(db)
    reset = new AccountPasswordResetService(access, passwords, sessions)
    admin = await createUser('admin')
    await new AccessSeedService(db).initialize(admin.account)
  }, 90_000)

  afterAll(async () => {
    try {
      if (sessions) {
        for (const userId of userIds) await sessions.revokeAllForUser(userId)
      }
    } finally {
      if (redis) redis.disconnect()
      if (pool) await pool.end()
      if (adminPool) {
        try {
          await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
        } finally {
          await adminPool.end()
        }
      }
    }
  }, 30_000)

  it('本人改密提交后原密码失效，三个终端会话均撤销', async () => {
    const user = await createUser('self_success')
    const digests = await createTerminalSessions(user.id)
    const before = await passwordHash(user.id)

    await expect(
      auth.changePassword(user.id, {
        oldPassword: originalPassword,
        newPassword: changedPassword,
        confirmPassword: changedPassword,
      }),
    ).resolves.toEqual({ passwordChanged: true })

    expect(await passwordHash(user.id)).not.toBe(before)
    await expectSessions(digests, user.id, false)
    await expect(
      auth.login(
        { account: user.account, password: originalPassword },
        { ip: '127.0.0.1', userAgent: 'web' },
      ),
    ).rejects.toMatchObject({ definition: AUTH_ERRORS.INVALID_CREDENTIALS })
    await expect(
      auth.login(
        { account: user.account, password: changedPassword },
        { ip: '127.0.0.1', userAgent: 'web' },
      ),
    ).resolves.toMatchObject({ tokenType: 'Bearer' })
  }, 30_000)

  it('本人改密撤销依赖失败时真实数据库回滚，原会话仍有效', async () => {
    const user = await createUser('self_rollback')
    const digests = await createTerminalSessions(user.id)
    const before = await passwordHash(user.id)
    const revoke = vi
      .spyOn(sessions, 'revokeAllForUser')
      .mockRejectedValueOnce(new Error('injected Redis failure'))
    try {
      await expect(
        auth.changePassword(user.id, {
          oldPassword: originalPassword,
          newPassword: changedPassword,
          confirmPassword: changedPassword,
        }),
      ).rejects.toMatchObject({ definition: AUTH_ERRORS.SERVICE_UNAVAILABLE })
    } finally {
      revoke.mockRestore()
    }

    expect(await passwordHash(user.id)).toBe(before)
    await expectSessions(digests, user.id, true)
  }, 30_000)

  it('平台管理员重置仅影响目标摘要与三个终端会话，管理员会话保持有效', async () => {
    const target = await createUser('reset_success')
    const targetDigests = await createTerminalSessions(target.id)
    const [adminDigest] = await createTerminalSessions(admin.id)
    const before = await passwordHash(target.id)

    await expect(
      reset.resetPassword({
        actor: { userId: admin.id, requestId: randomUUID() },
        userId: target.id,
        body: { newPassword: resetPassword, confirmPassword: resetPassword },
      }),
    ).resolves.toEqual({ passwordReset: true })

    expect(await passwordHash(target.id)).not.toBe(before)
    await expectSessions(targetDigests, target.id, false)
    expect(await sessions.validateAndTouch(adminDigest!)).toEqual({
      userId: admin.id,
      terminal: 'web',
    })
    const [saved] = await db.select().from(schema.users).where(eq(schema.users.id, target.id))
    expect(saved?.status).toBe('active')
    const audit = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.objectId, target.id))
    expect(audit.filter((entry) => entry.action === 'account.password.reset')).toMatchObject([
      { actorUserId: admin.id, objectId: target.id, summary: { result: 'success' } },
    ])
    await expect(
      auth.login(
        { account: target.account, password: originalPassword },
        { ip: '127.0.0.1', userAgent: 'web' },
      ),
    ).rejects.toMatchObject({ definition: AUTH_ERRORS.INVALID_CREDENTIALS })
    await expect(
      auth.login(
        { account: target.account, password: resetPassword },
        { ip: '127.0.0.1', userAgent: 'web' },
      ),
    ).resolves.toMatchObject({ tokenType: 'Bearer' })
  }, 30_000)

  it('管理员重置撤销依赖失败时摘要与成功审计回滚，目标和管理员会话均有效', async () => {
    const target = await createUser('reset_rollback')
    const targetDigests = await createTerminalSessions(target.id)
    const [adminDigest] = await createTerminalSessions(admin.id)
    const before = await passwordHash(target.id)
    const revoke = vi
      .spyOn(sessions, 'revokeAllForUser')
      .mockRejectedValueOnce(new Error('injected Redis failure'))
    try {
      await expect(
        reset.resetPassword({
          actor: { userId: admin.id, requestId: randomUUID() },
          userId: target.id,
          body: { newPassword: resetPassword, confirmPassword: resetPassword },
        }),
      ).rejects.toMatchObject({ definition: AUTH_ERRORS.SERVICE_UNAVAILABLE })
    } finally {
      revoke.mockRestore()
    }

    expect(await passwordHash(target.id)).toBe(before)
    await expectSessions(targetDigests, target.id, true)
    expect(await sessions.validateAndTouch(adminDigest!)).toEqual({
      userId: admin.id,
      terminal: 'web',
    })
    const audit = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.objectId, target.id))
    expect(audit.filter((entry) => entry.action === 'account.password.reset')).toHaveLength(0)
  }, 30_000)

  it('平台管理员不能通过重置入口重置自己的密码', async () => {
    const before = await passwordHash(admin.id)
    await expect(
      reset.resetPassword({
        actor: { userId: admin.id, requestId: randomUUID() },
        userId: admin.id,
        body: { newPassword: resetPassword, confirmPassword: resetPassword },
      }),
    ).rejects.toMatchObject({ definition: ACCESS_ERRORS.FORBIDDEN })
    expect(await passwordHash(admin.id)).toBe(before)
  })
})
