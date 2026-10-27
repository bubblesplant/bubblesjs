import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { and, eq } from 'drizzle-orm'
import { config } from 'dotenv'
import { ConfigService } from '@nestjs/config'
import { StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe } from '@nestjs/common'
import { HttpAdapterHost, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { AccessScope, DictionaryRecord } from 'shared/types'
import { toValidationDetails } from 'shared/utils'
import * as schema from '@/database/schema'
import { ENV_ARR } from '@/utils/env-arr'
import { createFastifyAdapter } from '@/common/adapters/fastify.adapter'
import { SWAGGER_SESSION_AUTH } from '@/common/constants/swagger.constants'
import { COMMON_ERRORS } from '@/common/error/common.error'
import { AppException } from '@/common/exceptions/app.exception'
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter'
import { AccessGuard } from '@/modules/access/access.guard'
import { AccessService } from '@/modules/access/access.service'
import { AccessSeedService } from '@/modules/access/seed/access-seed.service'
import { SessionAuthGuard } from '@/modules/auth/guards/session-auth.guard'
import { SessionTokenService } from '@/modules/auth/session/session-token.service'
import type { SessionStoreService } from '@/modules/auth/session/session-store.service'
import type { AuthRepository } from '@/modules/auth/auth.repository'
import { DictionariesController } from '@/modules/dictionaries/dictionaries.controller'
import { DictionariesService } from '@/modules/dictionaries/dictionaries.service'

const enabled = process.env.RUN_DICTIONARY_INTEGRATION === 'true'
const databaseName = `dictionary_it_${crypto.randomUUID().replaceAll('-', '')}`
const platformScope: AccessScope = { type: 'platform' }
const item = { value: 'm', label: '米', sort: 1, status: 'active' as const }
const createBody = {
  code: 'units',
  name: '计量单位',
  description: '',
  status: 'active' as const,
  items: [item],
}
const actor = (userId: string) => ({ userId, requestId: crypto.randomUUID() })

describe.skipIf(!enabled)('字典本机隔离 PostgreSQL 与真实 HTTP 链路', () => {
  let adminPool: Pool | undefined
  let pool: Pool | undefined
  let created = false
  let app: NestFastifyApplication | undefined
  let db: ReturnType<typeof drizzle<typeof schema>>
  let service: DictionariesService
  let access: AccessService
  let adminId: string
  let memberId: string
  let companyAdminId: string
  let companyId: string
  let foreignCompanyId: string
  let projectId: string
  let privateProjectId: string
  let shared: DictionaryRecord
  let companyScope: AccessScope
  let projectScope: AccessScope
  const adminToken = 'a'.repeat(43)
  const memberToken = 'b'.repeat(43)
  const headers = { authorization: `Bearer ${adminToken}` }

  beforeAll(async () => {
    for (const path of ENV_ARR) config({ path, quiet: true })
    if (!process.env.DATABASE_URL)
      config({ path: ['.env.development.local', '.env.development'], quiet: true })
    const connection = new URL(process.env.DATABASE_URL!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname))
      throw new Error('只允许本机隔离数据库测试')
    adminPool = new Pool({ connectionString: connection.toString(), connectionTimeoutMillis: 3000 })
    await adminPool.query(`CREATE DATABASE "${databaseName}"`)
    created = true
    connection.pathname = `/${databaseName}`
    pool = new Pool({ connectionString: connection.toString(), max: 6 })
    db = drizzle(pool, { schema })
    await migrate(db, { migrationsFolder: './drizzle' })
    await migrate(db, { migrationsFolder: './drizzle' })
    const users = await db
      .insert(schema.users)
      .values([
        { account: 'dict_admin', name: '测试平台管理员', passwordHash: 'test-only' },
        { account: 'dict_member', name: '测试普通成员', passwordHash: 'test-only' },
        { account: 'dict_company_admin', name: '测试企业管理员', passwordHash: 'test-only' },
      ])
      .returning()
    ;[adminId, memberId, companyAdminId] = users.map((user) => user.id) as [string, string, string]
    const companies = await db
      .insert(schema.companies)
      .values([
        { code: 'dict_company', name: '测试企业' },
        { code: 'dict_foreign', name: '其他企业' },
      ])
      .returning()
    companyId = companies[0]!.id
    foreignCompanyId = companies[1]!.id
    const projects = await db
      .insert(schema.projects)
      .values([
        { companyId, code: 'dict_project', name: '测试项目' },
        { companyId, code: 'dict_private', name: '其他项目' },
      ])
      .returning()
    projectId = projects[0]!.id
    privateProjectId = projects[1]!.id
    await db.insert(schema.companyMembers).values([
      { companyId, userId: memberId },
      { companyId, userId: companyAdminId },
    ])
    await db.insert(schema.projectMembers).values({ companyId, projectId, userId: memberId })
    access = new AccessService(db)
    const seed = new AccessSeedService(db)
    await seed.initialize('dict_admin')
    const [companyRole] = await db
      .select()
      .from(schema.roles)
      .where(
        and(
          eq(schema.roles.companyId, companyId),
          eq(schema.roles.scopeType, 'company'),
          eq(schema.roles.builtin, 'administrator'),
        ),
      )
    await db.insert(schema.userRoles).values({ userId: companyAdminId, roleId: companyRole!.id })
    companyScope = { type: 'company', companyId }
    projectScope = { type: 'project', companyId, projectId }
    service = new DictionariesService(access)
    shared = await service.create({ actor: actor(adminId), scope: platformScope, body: createBody })

    Reflect.defineMetadata('design:paramtypes', [DictionariesService], DictionariesController)
    const module = await Test.createTestingModule({
      controllers: [DictionariesController],
      providers: [{ provide: DictionariesService, useValue: service }],
    }).compile()
    app = module.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
      logger: false,
    })
    const reflector = new Reflector()
    const tokens = new SessionTokenService(
      new ConfigService({ session: { tokenPepper: 'test-only-dictionary-pepper' } }),
    )
    const sessions = {
      validateAndTouch: async (digest: string) =>
        digest === tokens.digest(adminToken)
          ? { userId: adminId, terminal: 'web' }
          : digest === tokens.digest(memberToken)
            ? { userId: memberId, terminal: 'web' }
            : null,
    } as unknown as SessionStoreService
    const accounts = {
      findPublicById: async (id: string) => ({ id, status: 'active' }),
    } as unknown as AuthRepository
    app.useGlobalGuards(
      new SessionAuthGuard(reflector, tokens, sessions, accounts),
      new AccessGuard(reflector, access),
    )
    app.useGlobalPipes(
      new StandardSchemaValidationPipe({
        transform: true,
        exceptionFactory: (issues) =>
          new AppException(COMMON_ERRORS.VALIDATION_FAILED, {
            details: toValidationDetails(issues),
          }),
      }),
    )
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(reflector))
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(HttpAdapterHost)))
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  }, 30000)

  afterAll(async () => {
    try {
      await app?.close()
    } finally {
      try {
        await pool?.end()
      } finally {
        try {
          if (created) await adminPool!.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
        } finally {
          await adminPool?.end()
        }
      }
    }
  })

  it('完整迁移可重复执行，数据库拒绝相同归属编码和不匹配项目归属', async () => {
    await expect(
      db.insert(schema.dictionaries).values({ ...createBody, scopeType: 'platform' }),
    ).rejects.toThrow()
    await expect(
      db.insert(schema.dictionaries).values({
        ...createBody,
        scopeType: 'project',
        companyId: foreignCompanyId,
        projectId,
      }),
    ).rejects.toThrow()
  })
  it('普通企业成员无需平台角色或配置页权限读取平台选项', async () => {
    const response = await app!.inject({
      method: 'GET',
      url: '/dictionary-options?scopeType=platform&code=units',
      headers: { authorization: `Bearer ${memberToken}` },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([{ label: '米', value: 'm' }])
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-request-id']).toBeTruthy()
  })
  it('配置页保持管理权限，不允许普通成员读取或写入平台配置', async () => {
    for (const method of ['GET', 'POST'] as const) {
      const response = await app!.inject({
        method,
        url: '/platform/dictionaries',
        headers: { authorization: `Bearer ${memberToken}` },
        ...(method === 'POST' ? { payload: createBody } : {}),
      })
      expect(response.statusCode).toBe(403)
    }
  })
  it('管理 HTTP 完成创建、搜索和版本更新，并返回公开记录', async () => {
    const created = await app!.inject({
      method: 'POST',
      url: '/platform/dictionaries',
      headers,
      payload: { ...createBody, code: 'http_units' },
    })
    expect(created.statusCode).toBe(201)
    const dictionary = created.json<DictionaryRecord>()
    expect(dictionary).toMatchObject({ code: 'http_units', scope: platformScope, version: 1 })
    const listed = await app!.inject({
      method: 'GET',
      url: '/platform/dictionaries?query=http_units',
      headers,
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toMatchObject({ total: 1, items: [{ id: dictionary.id }] })
    const { code: _code, ...fields } = createBody
    const updated = await app!.inject({
      method: 'PATCH',
      url: `/platform/dictionaries/${dictionary.id}`,
      headers,
      payload: { ...fields, name: 'HTTP 更新字典', expectedVersion: dictionary.version },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({ name: 'HTTP 更新字典', version: 2 })
  })
  it('三范围同编码独立，企业与项目成员按真实归属读取', async () => {
    await service.create({
      actor: actor(companyAdminId),
      scope: companyScope,
      body: { ...createBody, name: '企业单位' },
    })
    await service.create({
      actor: actor(companyAdminId),
      scope: projectScope,
      body: { ...createBody, name: '项目单位' },
    })
    expect(
      (await service.list({ actor: actor(companyAdminId), scope: companyScope, query: {} }))
        .items[0]!.name,
    ).toBe('企业单位')
    await expect(
      service.options({
        actor: actor(memberId),
        query: { scopeType: 'company', companyId, code: 'units' },
      }),
    ).resolves.toEqual([{ label: '米', value: 'm' }])
    await expect(
      service.options({
        actor: actor(memberId),
        query: { scopeType: 'project', companyId, projectId, code: 'units' },
      }),
    ).resolves.toEqual([{ label: '米', value: 'm' }])
    await expect(
      service.options({
        actor: actor(memberId),
        query: { scopeType: 'project', companyId, projectId: privateProjectId, code: 'units' },
      }),
    ).rejects.toBeInstanceOf(AppException)
    await expect(
      service.options({
        actor: actor(memberId),
        query: { scopeType: 'company', companyId: foreignCompanyId, code: 'units' },
      }),
    ).rejects.toBeInstanceOf(AppException)
  })
  it('跨范围修改返回未找到，不能通过已知 UUID 修改他人字典', async () => {
    const { code: _code, ...body } = createBody
    await expect(
      service.update({
        actor: actor(companyAdminId),
        scope: companyScope,
        dictionaryId: shared.id,
        body: { ...body, expectedVersion: 1 },
      }),
    ).rejects.toMatchObject({ definition: { code: 'DICTIONARY.NOT_FOUND' } })
  })
  it('并发版本校验只允许一个保存，并与审计同事务', async () => {
    const { code: _code, ...body } = createBody
    const input = {
      actor: actor(adminId),
      scope: platformScope,
      dictionaryId: shared.id,
      body: { ...body, expectedVersion: 1 },
    }
    const results = await Promise.allSettled([service.update(input), service.update(input)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { definition: { code: 'ACCESS.VERSION_CONFLICT' } },
    })
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.objectId, shared.id),
          eq(schema.auditLogs.action, 'dictionary.update'),
        ),
      )
    expect(logs).toHaveLength(1)
    shared = (
      results.find(
        (result) => result.status === 'fulfilled',
      ) as PromiseFulfilledResult<DictionaryRecord>
    ).value
  })
  it('历史项禁删，停用选项返回空数组，停用字典返回 404', async () => {
    const { code: _code, ...body } = createBody
    const input = { actor: actor(adminId), scope: platformScope, dictionaryId: shared.id }
    await expect(
      service.update({ ...input, body: { ...body, items: [], expectedVersion: shared.version } }),
    ).rejects.toMatchObject({ definition: { code: 'DICTIONARY.ITEM_VALUE_IMMUTABLE' } })
    shared = await service.update({
      ...input,
      body: { ...body, items: [{ ...item, status: 'disabled' }], expectedVersion: shared.version },
    })
    await expect(
      service.options({ actor: actor(memberId), query: { scopeType: 'platform', code: 'units' } }),
    ).resolves.toEqual([])
    shared = await service.update({
      ...input,
      body: { ...body, status: 'disabled', expectedVersion: shared.version },
    })
    const response = await app!.inject({
      method: 'GET',
      url: '/dictionary-options?scopeType=platform&code=units',
      headers,
    })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'DICTIONARY.NOT_FOUND' })
  })
  it('HTTP 请求应用原生校验，错误保留统一错误格式', async () => {
    const response = await app!.inject({
      method: 'POST',
      url: '/platform/dictionaries',
      headers,
      payload: { ...createBody, code: 'Invalid', items: [item, item] },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'COMMON.VALIDATION_FAILED' })
    const unauthorized = await app!.inject({
      method: 'GET',
      url: '/dictionary-options?scopeType=platform&code=units',
    })
    expect(unauthorized.statusCode).toBe(401)
  })
  it('Swagger 注册三类管理路由和独立业务选项接口', () => {
    const document = SwaggerModule.createDocument(
      app!,
      new DocumentBuilder().addBearerAuth(undefined, SWAGGER_SESSION_AUTH).build(),
    )
    expect(document.paths['/platform/dictionaries']?.post?.requestBody).toBeTruthy()
    expect(document.paths['/companies/{companyId}/dictionaries']).toBeTruthy()
    expect(document.paths['/companies/{companyId}/projects/{projectId}/dictionaries']).toBeTruthy()
    expect(document.paths['/dictionary-options']?.get?.responses['200']).toBeTruthy()
  })
})
