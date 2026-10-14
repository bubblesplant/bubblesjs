import 'reflect-metadata'
import { describe, expect, it, vi } from 'vite-plus/test'
import { Reflector } from '@nestjs/core'
import type { ExecutionContext } from '@nestjs/common'
import { AccessGuard } from '@/modules/access/access.guard'
import type { AccessService } from '@/modules/access/access.service'
import { ACCESS_POLICY_KEY } from '@/common/decorators/access-policy.decorator'
import { IS_PUBLIC_KEY } from '@/common/constants/auth'
import { entityListSchema, parse } from '@/modules/access/access.validation'
import { listSchema } from '@/modules/members/accounts/accounts.validation'
import {
  uploadPartParamsSchema,
  uploadSessionParamsSchema,
} from '@/modules/upload/dto/upload-params.dto'

/** 创建独立请求、反射处理器和权限服务桩，供守卫测试设置路由元数据并检查鉴权调用。 */
function fixture() {
  const handler = () => undefined
  class ControllerFixture {}
  const request = {
    method: 'GET',
    id: 'policy-fixture',
    auth: { userId: crypto.randomUUID() },
    params: { companyId: crypto.randomUUID(), projectId: crypto.randomUUID() },
  }
  const context = {
    getHandler: () => handler,
    getClass: () => ControllerFixture,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  const read = vi.fn().mockResolvedValue(undefined)
  return {
    handler,
    request,
    context,
    read,
    guard: new AccessGuard(new Reflector(), { read } as unknown as AccessService),
  }
}

describe('权限默认拒绝与路由校验边界', () => {
  it('未明确标注公开或权限策略的端点默认拒绝', async () => {
    const { guard, context, read } = fixture()
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      definition: { code: 'ACCESS.FORBIDDEN' },
    })
    expect(read).not.toHaveBeenCalled()
  })
  it('明确公开和只需登录的端点允许通过权限层', async () => {
    const { guard, context, handler, read } = fixture()
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler)
    await expect(guard.canActivate(context)).resolves.toBe(true)
    Reflect.deleteMetadata(IS_PUBLIC_KEY, handler)
    Reflect.defineMetadata(ACCESS_POLICY_KEY, { scope: 'authenticated' }, handler)
    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(read).not.toHaveBeenCalled()
  })
  it('项目管理端点使用声明的企业范围，路由策略解析项目范围', async () => {
    const { guard, context, handler, request, read } = fixture()
    Reflect.defineMetadata(
      ACCESS_POLICY_KEY,
      { scope: 'company', permission: 'company.projects.create', adminOnly: true },
      handler,
    )
    await guard.canActivate(context)
    expect(read).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: { type: 'company', companyId: request.params.companyId },
        permission: 'company.projects.create',
        adminOnly: true,
      }),
      expect.any(Function),
    )
    Reflect.defineMetadata(
      ACCESS_POLICY_KEY,
      { scope: 'route', permission: '{scope}.profile.read' },
      handler,
    )
    await guard.canActivate(context)
    expect(read).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: { type: 'project', ...request.params },
        permission: 'project.profile.read',
      }),
      expect.any(Function),
    )
  })
  it('locked 仅属于账号状态，不传入企业项目或成员的数据库枚举', () => {
    expect(() => parse(entityListSchema, { status: 'locked' })).toThrow()
    expect(parse(listSchema, { status: 'locked' }).status).toBe('locked')
  })
  it('上传状态与完成接口只校验会话编号，分片接口额外校验分片编号', () => {
    const params = { uploadSessionId: crypto.randomUUID() }
    expect(uploadSessionParamsSchema.safeParse(params).success).toBe(true)
    expect(uploadPartParamsSchema.safeParse(params).success).toBe(false)
    expect(uploadPartParamsSchema.safeParse({ ...params, partNumber: '1' }).success).toBe(true)
  })
})
