import 'reflect-metadata'
import { describe, expect, it } from 'vite-plus/test'
import { StandardSchemaSerializerInterceptor, StandardSchemaValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AppException } from '@/common/exceptions/app.exception'
import { COMMON_ERRORS } from '@/common/error/common.error'
import { entityListSchema, parse } from '@/modules/access/access.validation'
import { loginSchema } from '@/modules/auth/dto/login.dto'
import { currentUserSchema } from '@/modules/auth/dto/auth-response.dto'
import { changePasswordSchema } from '@/modules/auth/password/change-password.dto'
import { toValidationDetails } from 'shared/utils'

/** 创建与应用一致的校验器，验证原生 Pipe 与统一错误契约之间的连接。 */
function makePipe() {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: (issues) =>
      new AppException(COMMON_ERRORS.VALIDATION_FAILED, {
        details: toValidationDetails(issues),
      }),
  })
}

describe('Nest 原生 Schema 迁移', () => {
  it('登录参数应用 trim，密码保持原值', async () => {
    await expect(
      makePipe().transform(
        { account: ' demo ', password: ' x ' },
        {
          type: 'body',
          schema: loginSchema,
        },
      ),
    ).resolves.toEqual({ account: 'demo', password: ' x ' })
  })

  it('请求错误保留业务错误码和 Zod 字段 code', async () => {
    await expect(
      makePipe().transform(
        { account: 'a', password: '' },
        {
          type: 'body',
          schema: loginSchema,
        },
      ),
    ).rejects.toMatchObject({
      definition: { code: 'COMMON.VALIDATION_FAILED', status: 400 },
      details: expect.arrayContaining([
        expect.objectContaining({ path: 'account', code: 'too_small' }),
      ]),
    })
  })

  it('分页默认值、数字转换与严格对象约束保持有效', async () => {
    const pipe = makePipe()
    await expect(
      pipe.transform(
        {},
        {
          type: 'query',
          schema: entityListSchema,
        },
      ),
    ).resolves.toEqual({ page: 1, pageSize: 20 })
    await expect(
      pipe.transform(
        { page: '2', pageSize: '10' },
        {
          type: 'query',
          schema: entityListSchema,
        },
      ),
    ).resolves.toEqual({ page: 2, pageSize: 10 })
    await expect(
      pipe.transform(
        { extra: 'unsupported' },
        {
          type: 'query',
          schema: entityListSchema,
        },
      ),
    ).rejects.toBeInstanceOf(AppException)
  })

  it('确认密码不一致仍定位到 confirmPassword', async () => {
    await expect(
      makePipe().transform(
        {
          oldPassword: 'qaOld12345',
          newPassword: 'qaNew12345',
          confirmPassword: 'different',
        },
        { type: 'body', schema: changePasswordSchema },
      ),
    ).rejects.toMatchObject({
      details: expect.arrayContaining([
        expect.objectContaining({ path: 'confirmPassword', code: 'custom' }),
      ]),
    })
  })

  it('兼容 Standard Schema key 路径与不提供 code 的校验器', () => {
    expect(toValidationDetails([{ message: '无效', path: [{ key: 'items' }, 0, 'name'] }])).toEqual(
      [{ path: 'items.0.name', code: 'invalid', message: '无效' }],
    )
  })

  it('守卫和旧控制器的手动 parse 保留转换结果与统一异常', () => {
    expect(parse(entityListSchema, { page: '2' })).toEqual({ page: 2, pageSize: 20 })
    expect(() => parse(entityListSchema, { page: '0' })).toThrow(AppException)
  })

  it('响应剥离内部字段，顶层数组按单项 Schema 处理', async () => {
    const serializer = new StandardSchemaSerializerInterceptor(new Reflector())
    const publicUser = {
      id: crypto.randomUUID(),
      account: 'demo',
      name: '示例用户',
      terminal: 'web',
    }
    const internalUser = { ...publicUser, passwordHash: 'test-only-private-field' }
    await expect(serializer.serialize(internalUser, currentUserSchema)).resolves.toEqual(publicUser)
    await expect(serializer.serialize([internalUser], currentUserSchema)).resolves.toEqual([
      publicUser,
    ])
  })

  it('缺失响应字段导致服务端校验失败', async () => {
    const serializer = new StandardSchemaSerializerInterceptor(new Reflector())
    await expect(serializer.serialize({ account: 'demo' }, currentUserSchema)).rejects.toThrow(
      'Serialization failed',
    )
  })
})
