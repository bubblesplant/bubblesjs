import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vite-plus/test'
import { createFastifyAdapter } from '@/common/adapters/fastify.adapter'
import { AppException } from '@/common/exceptions/app.exception'
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter'
import {
  logPasswordSecurityEvent,
  markPasswordFailure,
  markPasswordTargetResolved,
} from '@/common/security/password-security-event'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import type { AccessService } from '@/modules/access/access.service'
import { AUTH_ERRORS } from '@/modules/auth/auth.errors'
import type { AuthRepository } from '@/modules/auth/auth.repository'
import { AuthService } from '@/modules/auth/auth.service'
import type { PasswordService } from '@/modules/auth/password.service'
import type { SessionStoreService } from '@/modules/auth/session/session-store.service'
import type { SessionTokenService } from '@/modules/auth/session/session-token.service'
import { AccountPasswordResetService } from '@/modules/members/accounts/password-reset/password-reset.service'
import { resetAccountPasswordSchema } from '@/modules/members/accounts/password-reset/reset-password.validation'

const actorUserId = '48b15743-7795-4896-9495-a3bf6ff979d5'
const targetUserId = 'a6d3164d-3dd3-45d1-9d05-a43043fe6a15'
const oldPassword = 'a'.repeat(10)
const newPassword = 'b'.repeat(10)

/** 用事务成功时才提交摘要的替身验证失败回滚与调用顺序。 */
function createAuthFixture(options: { oldPasswordMatches?: boolean; revokeFails?: boolean } = {}) {
  let persistedHash = 'stored-digest'
  const repository = {
    withPasswordWriteLock: vi.fn(async (_userId, operation) => {
      let stagedHash: string | undefined
      const result = await operation({
        passwordHash: persistedHash,
        setPasswordHash: async (hash: string) => {
          stagedHash = hash
        },
      })
      if (stagedHash) persistedHash = stagedHash
      return result
    }),
  }
  const passwords = {
    verify: vi.fn(async () => options.oldPasswordMatches !== false),
    hash: vi.fn(async () => 'new-digest'),
  }
  const sessions = {
    revokeAllForUser: vi.fn(async () => {
      if (options.revokeFails) throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE)
    }),
  }
  const service = new AuthService(
    repository as unknown as AuthRepository,
    passwords as unknown as PasswordService,
    {} as SessionTokenService,
    sessions as unknown as SessionStoreService,
    new ConfigService({ session: { idleTtlMs: 60_000 } }),
  )
  return { service, repository, passwords, sessions, getPersistedHash: () => persistedHash }
}

/** 用目标行查询及事务成功提交替身验证管理员重置的授权和副作用。 */
function createResetFixture(options: { targetExists?: boolean; revokeFails?: boolean } = {}) {
  let persistedHash = 'stored-digest'
  let stagedHash: string | undefined
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: async () => (options.targetExists === false ? [] : [{ id: targetUserId }]),
        }),
      }),
    }),
    update: () => ({
      set: (values: { passwordHash: string }) => ({
        where: async () => {
          stagedHash = values.passwordHash
        },
      }),
    }),
  }
  const access = {
    write: vi.fn(async (_requirement, operation) => {
      const result = await operation(tx, { administrator: 'platform' })
      if (stagedHash) persistedHash = stagedHash
      return result
    }),
    audit: vi.fn(
      async (_tx: unknown, _input: { action: string; objectId: string; summary: unknown }) =>
        undefined,
    ),
  }
  const passwords = { hash: vi.fn(async () => 'new-digest') }
  const sessions = {
    revokeAllForUser: vi.fn(async () => {
      if (options.revokeFails) throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE)
    }),
  }
  const service = new AccountPasswordResetService(
    access as unknown as AccessService,
    passwords as unknown as PasswordService,
    sessions as unknown as SessionStoreService,
  )
  return { service, access, passwords, sessions, getPersistedHash: () => persistedHash }
}

describe('本人修改密码', () => {
  it('成功写入摘要并只撤销本人全部会话', async () => {
    const fixture = createAuthFixture()
    await expect(
      fixture.service.changePassword(actorUserId, {
        oldPassword,
        newPassword,
        confirmPassword: newPassword,
      }),
    ).resolves.toEqual({ passwordChanged: true })
    expect(fixture.getPersistedHash()).toBe('new-digest')
    expect(fixture.sessions.revokeAllForUser).toHaveBeenCalledExactlyOnceWith(actorUserId)
  })

  it('旧密码错误或新旧相同均不写入摘要', async () => {
    const wrongOld = createAuthFixture({ oldPasswordMatches: false })
    await expect(
      wrongOld.service.changePassword(actorUserId, {
        oldPassword,
        newPassword,
        confirmPassword: newPassword,
      }),
    ).rejects.toMatchObject({ definition: { code: AUTH_ERRORS.OLD_PASSWORD_INCORRECT.code } })
    expect(wrongOld.passwords.hash).not.toHaveBeenCalled()
    expect(wrongOld.sessions.revokeAllForUser).not.toHaveBeenCalled()

    const reuse = createAuthFixture()
    await expect(
      reuse.service.changePassword(actorUserId, {
        oldPassword,
        newPassword: oldPassword,
        confirmPassword: oldPassword,
      }),
    ).rejects.toMatchObject({ definition: { code: AUTH_ERRORS.PASSWORD_REUSE_NOT_ALLOWED.code } })
    expect(reuse.getPersistedHash()).toBe('stored-digest')
  })

  it('Redis 撤销失败时事务回滚，不能返回成功', async () => {
    const fixture = createAuthFixture({ revokeFails: true })
    await expect(
      fixture.service.changePassword(actorUserId, {
        oldPassword,
        newPassword,
        confirmPassword: newPassword,
      }),
    ).rejects.toMatchObject({ definition: { code: AUTH_ERRORS.SERVICE_UNAVAILABLE.code } })
    expect(fixture.getPersistedHash()).toBe('stored-digest')
  })

  it('登录持共享锁后发现摘要已变化时拒绝建立新会话', async () => {
    const fixture = createAuthFixture()
    const repository = {
      findByAccount: vi.fn(async () => ({
        id: actorUserId,
        account: 'fixture_account',
        status: 'active',
        passwordHash: 'before-lock',
      })),
      withActiveUserLock: vi.fn(async (_userId, operation) => operation('after-lock')),
    }
    const sessions = { createOrReplace: vi.fn() }
    const service = new AuthService(
      repository as unknown as AuthRepository,
      { verify: vi.fn(async () => true) } as unknown as PasswordService,
      {
        createToken: () => ({ rawToken: 'fixture-token', tokenDigest: 'fixture-digest' }),
      } as SessionTokenService,
      sessions as unknown as SessionStoreService,
      new ConfigService({ session: { idleTtlMs: 60_000 } }),
    )
    await expect(
      service.login(
        { account: 'fixture_account', password: oldPassword },
        { ip: '127.0.0.1', userAgent: '' },
      ),
    ).rejects.toMatchObject({ definition: { code: AUTH_ERRORS.INVALID_CREDENTIALS.code } })
    expect(sessions.createOrReplace).not.toHaveBeenCalled()
  })

  it('登录持锁读取失败时返回认证服务不可用', async () => {
    const repository = {
      findByAccount: vi.fn(async () => ({
        id: actorUserId,
        account: 'fixture_account',
        status: 'active',
        passwordHash: 'stored-digest',
      })),
      withActiveUserLock: vi.fn(async () => {
        throw new Error('storage-failure')
      }),
    }
    const sessions = { createOrReplace: vi.fn() }
    const service = new AuthService(
      repository as unknown as AuthRepository,
      { verify: vi.fn(async () => true) } as unknown as PasswordService,
      {
        createToken: () => ({ rawToken: 'fixture-token', tokenDigest: 'fixture-digest' }),
      } as SessionTokenService,
      sessions as unknown as SessionStoreService,
      new ConfigService({ session: { idleTtlMs: 60_000 } }),
    )
    await expect(
      service.login(
        { account: 'fixture_account', password: oldPassword },
        { ip: '127.0.0.1', userAgent: '' },
      ),
    ).rejects.toMatchObject({ definition: { code: AUTH_ERRORS.SERVICE_UNAVAILABLE.code } })
    expect(sessions.createOrReplace).not.toHaveBeenCalled()
  })
})

describe('平台管理员重置密码', () => {
  it('未知字段被剥离，不能将恶意字段名回显在校验错误中', () => {
    const parsed = resetAccountPasswordSchema.safeParse({
      newPassword,
      confirmPassword: newPassword,
      [oldPassword]: 'ignored',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({ newPassword, confirmPassword: newPassword })
    }
  })

  it('成功时仅修改目标摘要、撤销目标会话并写白名单审计', async () => {
    const fixture = createResetFixture()
    const resolved = vi.fn()
    await expect(
      fixture.service.resetPassword({
        actor: { userId: actorUserId, requestId: 'request-id' },
        userId: targetUserId,
        body: { newPassword, confirmPassword: newPassword },
        onTargetResolved: resolved,
      }),
    ).resolves.toEqual({ passwordReset: true })
    expect(fixture.access.write.mock.calls[0]?.[0]).toMatchObject({
      adminOnly: true,
      permission: 'platform.accounts.reset-password',
    })
    expect(resolved).toHaveBeenCalledExactlyOnceWith(targetUserId)
    expect(fixture.getPersistedHash()).toBe('new-digest')
    expect(fixture.sessions.revokeAllForUser).toHaveBeenCalledExactlyOnceWith(targetUserId)
    expect(fixture.access.audit.mock.calls[0]?.[1]).toMatchObject({
      action: 'account.password.reset',
      objectId: targetUserId,
      summary: { result: 'success' },
    })
  })

  it('自重置、目标不存在和 Redis 故障均不提交密码', async () => {
    const self = createResetFixture()
    await expect(
      self.service.resetPassword({
        actor: { userId: actorUserId, requestId: 'request-id' },
        userId: actorUserId,
        body: { newPassword, confirmPassword: newPassword },
      }),
    ).rejects.toMatchObject({ definition: { code: ACCESS_ERRORS.FORBIDDEN.code } })
    expect(self.passwords.hash).not.toHaveBeenCalled()

    const missing = createResetFixture({ targetExists: false })
    await expect(
      missing.service.resetPassword({
        actor: { userId: actorUserId, requestId: 'request-id' },
        userId: targetUserId,
        body: { newPassword, confirmPassword: newPassword },
      }),
    ).rejects.toMatchObject({ definition: { code: ACCESS_ERRORS.NOT_FOUND.code } })
    expect(missing.passwords.hash).not.toHaveBeenCalled()

    const redisFailure = createResetFixture({ revokeFails: true })
    await expect(
      redisFailure.service.resetPassword({
        actor: { userId: actorUserId, requestId: 'request-id' },
        userId: targetUserId,
        body: { newPassword, confirmPassword: newPassword },
      }),
    ).rejects.toMatchObject({ definition: { code: AUTH_ERRORS.SERVICE_UNAVAILABLE.code } })
    expect(redisFailure.getPersistedHash()).toBe('stored-digest')
  })

  it('事务提交故障返回认证服务不可用且不报告成功', async () => {
    const fixture = createResetFixture()
    fixture.access.write.mockRejectedValueOnce(new Error('storage-failure'))
    await expect(
      fixture.service.resetPassword({
        actor: { userId: actorUserId, requestId: 'request-id' },
        userId: targetUserId,
        body: { newPassword, confirmPassword: newPassword },
      }),
    ).rejects.toMatchObject({ definition: { code: AUTH_ERRORS.SERVICE_UNAVAILABLE.code } })
    expect(fixture.getPersistedHash()).toBe('stored-digest')
  })
})

describe('改密安全事件', () => {
  it('真实 Fastify 响应钩子按路由模板分别记录成功与前置拒绝', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const adapter = createFastifyAdapter()
    const fastify = adapter.getInstance()
    try {
      fastify.post('/platform/accounts/:userId/reset-password', (request) => {
        Object.assign(request, { auth: { userId: actorUserId } })
        markPasswordTargetResolved(request, targetUserId)
        return { passwordReset: true }
      })
      fastify.post(
        '/auth/change-password',
        {
          preHandler: (_request, reply, done) => {
            reply.code(403).send({ code: 'ACCESS.FORBIDDEN' })
            done()
          },
        },
        () => ({ passwordChanged: true }),
      )

      const reset = await fastify.inject({
        method: 'POST',
        url: `/platform/accounts/${targetUserId}/reset-password`,
        payload: { newPassword },
      })
      const rejected = await fastify.inject({
        method: 'POST',
        url: '/auth/change-password',
        payload: { oldPassword },
      })

      expect(reset.statusCode).toBe(200)
      expect(rejected.statusCode).toBe(403)
      expect(log).toHaveBeenCalledTimes(2)
      expect(log.mock.calls[0]?.[0]).toMatchObject({
        event: 'account.password.reset',
        actorUserId,
        targetUserId,
        result: 'success',
        reasonCode: null,
      })
      expect(log.mock.calls[1]?.[0]).toMatchObject({
        event: 'account.password.change',
        actorUserId: null,
        targetUserId: null,
        result: 'failure',
        reasonCode: 'COMMON.FORBIDDEN',
      })
      expect(JSON.stringify(log.mock.calls)).not.toContain(newPassword)
      expect(JSON.stringify(log.mock.calls)).not.toContain(oldPassword)
    } finally {
      await fastify.close()
      log.mockRestore()
    }
  })

  it('仅记录固定字段；未确认的重置目标保持 null', () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    try {
      const request = {
        method: 'POST',
        routeOptions: { url: '/platform/accounts/:userId/reset-password' },
        id: 'request-id',
        auth: { userId: actorUserId },
        body: { newPassword },
      }
      markPasswordFailure(request, ACCESS_ERRORS.NOT_FOUND.code)
      logPasswordSecurityEvent(request, { statusCode: 404 })
      expect(log.mock.calls[0]?.[0]).toEqual({
        event: 'account.password.reset',
        actorUserId,
        targetUserId: null,
        requestId: 'request-id',
        result: 'failure',
        reasonCode: ACCESS_ERRORS.NOT_FOUND.code,
        occurredAt: expect.any(String),
      })

      markPasswordTargetResolved(request, targetUserId)
      logPasswordSecurityEvent(request, { statusCode: 503 })
      expect(log.mock.calls[1]?.[0]).toMatchObject({
        targetUserId,
        result: 'failure',
        reasonCode: ACCESS_ERRORS.NOT_FOUND.code,
      })
      expect(JSON.stringify(log.mock.calls)).not.toContain(newPassword)
    } finally {
      log.mockRestore()
    }
  })

  it('密码接口 5xx 不序列化底层异常进入普通错误日志', () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    try {
      const adapterHost = {
        httpAdapter: {
          isHeadersSent: () => false,
          setHeader: vi.fn(),
          reply: vi.fn(),
        },
      }
      const filter = new GlobalExceptionFilter(adapterHost as never)
      const request = {
        method: 'POST',
        routeOptions: { url: '/auth/change-password' },
        id: 'request-id',
        auth: { userId: actorUserId },
      }
      filter.catch(
        new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, { cause: new Error('private-cause') }),
        {
          switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
        } as never,
      )
      expect(errorLog).not.toHaveBeenCalled()
      expect(adapterHost.httpAdapter.reply).toHaveBeenCalledWith(
        {},
        {
          code: AUTH_ERRORS.SERVICE_UNAVAILABLE.code,
          message: AUTH_ERRORS.SERVICE_UNAVAILABLE.publicMessage,
        },
        503,
      )
    } finally {
      errorLog.mockRestore()
    }
  })
})
