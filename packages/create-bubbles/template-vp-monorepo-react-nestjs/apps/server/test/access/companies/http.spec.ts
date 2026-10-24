import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { StandardSchemaSerializerInterceptor } from '@nestjs/common'
import { HttpAdapterHost, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { COMMON_ERRORS } from '@/common/error/common.error'
import { AppException } from '@/common/exceptions/app.exception'
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter'
import { AccessGuard } from '@/modules/access/access.guard'
import { ACCESS_ERRORS } from '@/modules/access/access.errors'
import type { AccessService } from '@/modules/access/access.service'
import { SessionAuthGuard } from '@/modules/auth/guards/session-auth.guard'
import { SessionTokenService } from '@/modules/auth/session/session-token.service'
import type { SessionStoreService } from '@/modules/auth/session/session-store.service'
import type { AuthRepository } from '@/modules/auth/auth.repository'
import { CompaniesController } from '@/modules/companies/companies.controller'
import { CompaniesService } from '@/modules/companies/companies.service'

const userId = '00000000-0000-4000-8000-000000000001'
const token = 'a'.repeat(43)
const headers = { authorization: `Bearer ${token}` }
const administrator = {
  id: userId,
  name: '当前管理员',
  account: 'current_admin',
  accountStatus: 'active',
  memberStatus: 'active',
  effective: true,
}
const publicCompany = {
  id: '00000000-0000-4000-8000-000000000002',
  name: '企业',
  code: 'example',
  description: '',
  status: 'active',
  version: 1,
  createdAt: '2026-10-23T00:00:00.000Z',
  updatedAt: '2026-10-23T00:00:00.000Z',
  administrators: [administrator],
}
const company = {
  ...publicCompany,
  administrators: [{ ...administrator, passwordHash: 'private-field' }],
  privateField: 'private-field',
}
const page = { items: [company], total: 1, page: 1, pageSize: 20 }
const listCompanies = vi.fn()
const readAccess = vi.fn()
let app: NestFastifyApplication

beforeAll(async () => {
  Reflect.defineMetadata('design:paramtypes', [CompaniesService], CompaniesController)
  const module = await Test.createTestingModule({
    controllers: [CompaniesController],
    providers: [{ provide: CompaniesService, useValue: { listCompanies } }],
  }).compile()
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  })
  const reflector = new Reflector()
  const tokens = new SessionTokenService(
    new ConfigService({ session: { tokenPepper: 'test-only-company-list-pepper' } }),
  )
  app.useGlobalGuards(
    new SessionAuthGuard(
      reflector,
      tokens,
      {
        validateAndTouch: async (digest: string) =>
          digest === tokens.digest(token) ? { userId, terminal: 'web' } : null,
      } as SessionStoreService,
      {
        findPublicById: async () => ({ id: userId, status: 'active' }),
      } as unknown as AuthRepository,
    ),
    new AccessGuard(reflector, { read: readAccess } as unknown as AccessService),
  )
  app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(reflector))
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(HttpAdapterHost)))
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

beforeEach(() => {
  listCompanies.mockReset().mockResolvedValue(page)
  readAccess.mockReset().mockResolvedValue(undefined)
})

afterAll(async () => {
  await app?.close()
})

describe('平台企业列表 HTTP 与响应契约（数据及会话使用替身）', () => {
  it('真实序列化链保留管理员并剥离企业和管理员内部字段', async () => {
    const response = await app.inject({ method: 'GET', url: '/platform/companies', headers })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      items: [publicCompany],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    expect(response.json().items[0]).not.toHaveProperty('privateField')
    expect(response.json().items[0].administrators[0]).not.toHaveProperty('passwordHash')
    expect(listCompanies).toHaveBeenCalledWith({
      actor: { userId, requestId: expect.any(String) },
      query: { page: 1, pageSize: 20 },
    })
    expect(readAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { type: 'platform' },
        permission: 'platform.companies.read',
      }),
      expect.any(Function),
    )
  })

  it('分页参数非法保持统一 400 错误，业务服务不被调用', async () => {
    const response = await app.inject({ method: 'GET', url: '/platform/companies?page=0', headers })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'COMMON.VALIDATION_FAILED' })
    expect(listCompanies).not.toHaveBeenCalled()
  })

  it('缺失会话及缺少企业读取权限分别拒绝为 401 和 403', async () => {
    expect((await app.inject({ method: 'GET', url: '/platform/companies' })).statusCode).toBe(401)
    readAccess.mockRejectedValueOnce(new AppException(ACCESS_ERRORS.FORBIDDEN))
    const response = await app.inject({ method: 'GET', url: '/platform/companies', headers })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: 'ACCESS.FORBIDDEN' })
    expect(listCompanies).not.toHaveBeenCalled()
  })

  it('响应缺失管理员字段时安全返回 500', async () => {
    listCompanies.mockResolvedValueOnce({
      ...page,
      items: [{ ...company, administrators: undefined }],
    })
    const response = await app.inject({ method: 'GET', url: '/platform/companies', headers })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'COMMON.INTERNAL_SERVER_ERROR',
      message: COMMON_ERRORS.INTERNAL_SERVER_ERROR.publicMessage,
    })
  })

  it('Swagger 从同一响应 Schema 描述管理员字段及 Bearer 认证', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth(undefined, 'session').build(),
    )
    const operation = document.paths['/platform/companies']!.get!
    expect(operation.security).toEqual([{ session: [] }])
    const response = operation.responses['200']
    expect(JSON.stringify(response)).toContain('administrators')
    expect(JSON.stringify(response)).toContain('effective')
    expect(JSON.stringify(response)).not.toContain('passwordHash')
  })
})
