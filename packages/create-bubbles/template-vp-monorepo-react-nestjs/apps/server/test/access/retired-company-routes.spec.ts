import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { CompaniesController } from '@/modules/companies/companies.controller'
import { CompaniesService } from '@/modules/companies/companies.service'
import { MembersModule } from '@/modules/members/members.module'
import { MembersService } from '@/modules/members/members.service'
import { AccountsService } from '@/modules/members/accounts/accounts.service'
import { AccountPasswordResetService } from '@/modules/members/accounts/password-reset/password-reset.service'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const INVITATION_ID = '00000000-0000-4000-8000-000000000002'
let app: NestFastifyApplication

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [
      CompaniesController,
      ...Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MembersModule),
    ],
    providers: [CompaniesService, MembersService, AccountsService, AccountPasswordResetService].map(
      (provide) => ({ provide, useValue: {} }),
    ),
  }).compile()
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  })
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})
afterAll(async () => {
  await app?.close()
})

describe('撤下的企业层级与未确认邀请接口', () => {
  it('正常企业列表仍注册，层级变更路由不存在', async () => {
    const server = app.getHttpAdapter().getInstance()
    expect(server.hasRoute({ method: 'GET', url: '/platform/companies' })).toBe(true)
    expect(server.hasRoute({ method: 'GET', url: '/companies/:companyId/members' })).toBe(true)
    expect(
      (
        await server.inject({
          method: 'PATCH',
          url: `/platform/companies/${COMPANY_ID}/hierarchy`,
          payload: {},
        })
      ).statusCode,
    ).toBe(404)
    const paths = Object.getOwnPropertyNames(CompaniesController.prototype).map((name) =>
      Reflect.getMetadata(
        PATH_METADATA,
        CompaniesController.prototype[name as keyof CompaniesController],
      ),
    )
    expect(paths).not.toContain('platform/companies/tree')
  })
  it('企业成员模块不挂载邀请控制器，旧流程端点全部不可调用', async () => {
    const controllers: { name: string }[] = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      MembersModule,
    )
    expect(controllers.map((controller) => controller.name)).toEqual([
      'MembersController',
      'AccountsController',
    ])
    const server = app.getHttpAdapter().getInstance()
    for (const url of [
      `/companies/${COMPANY_ID}/member-invitations`,
      `/companies/${COMPANY_ID}/member-invitations/${INVITATION_ID}/revoke`,
      `/companies/${COMPANY_ID}/member-invitations/${INVITATION_ID}/reissue`,
      '/company-member-invitations/accept',
    ])
      expect((await server.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(404)
    expect(
      (await server.inject({ method: 'GET', url: `/companies/${COMPANY_ID}/member-invitations` }))
        .statusCode,
    ).toBe(404)
  })
})
