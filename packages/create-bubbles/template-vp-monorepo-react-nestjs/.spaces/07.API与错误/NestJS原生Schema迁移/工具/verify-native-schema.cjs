const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { resolve } = require('node:path')
const { readFileSync, writeFileSync } = require('node:fs')
const { randomUUID } = require('node:crypto')

const projectRoot = resolve(__dirname, '../../../..')
const serverRoot = resolve(projectRoot, 'apps/server')
const serverRequire = createRequire(resolve(serverRoot, 'package.json'))
const evidenceRoot = resolve(__dirname, '../测试证据')

/** 加载本项目的编译产物，验证 SWC 输出而非重新编译测试中的控制器。 */
function compiled(relative) {
  return serverRequire(resolve(serverRoot, 'dist', relative))
}

/** 持久化无请求凭据、密码和业务数据的验证摘要。 */
function saveEvidence(name, result) {
  writeFileSync(resolve(evidenceRoot, name), JSON.stringify(result, null, 2) + '\n', 'utf8')
}

/** 断言失败时只报告检查项，避免将请求正文或令牌写入证据。 */
function ensure(value, message) {
  assert.ok(value, message)
}

/** 验证 access:init 所依赖的 CommonJS 加载链；不执行初始化入口。 */
function checkCommonjs() {
  const common = serverRequire('@nestjs/common')
  const core = serverRequire('@nestjs/core')
  const utils = serverRequire('shared/utils')
  ensure(typeof common.StandardSchemaValidationPipe === 'function', '原生 Pipe 不可加载')
  ensure(typeof core.NestFactory.create === 'function', 'Nest Core 不可加载')
  ensure(typeof utils.toValidationDetails === 'function', 'shared utils 不可加载')
  saveEvidence('commonjs.json', {
    checkedAt: new Date().toISOString(),
    node: process.version,
    passed: true,
    modules: ['@nestjs/common', '@nestjs/core', 'shared/utils'],
    initializationExecuted: false,
  })
  console.log('CommonJS load OK')
}

/** 使用编译后的控制器和内存替身验证真实 Nest/Fastify 管线与 Swagger。 */
async function checkHttp() {
  serverRequire('reflect-metadata')
  const { Test } = serverRequire('@nestjs/testing')
  const { Logger } = serverRequire('@nestjs/common')
  const { APP_GUARD, APP_PIPE, APP_FILTER, APP_INTERCEPTOR } = serverRequire('@nestjs/core')
  const { SwaggerModule, DocumentBuilder } = serverRequire('@nestjs/swagger')
  const { AppModule } = compiled('app.module.js')
  const { AuthController } = compiled('modules/auth/auth.controller.js')
  const { AuthService } = compiled('modules/auth/auth.service.js')
  const { UploadController } = compiled('modules/upload/upload.controller.js')
  const { UploadService } = compiled('modules/upload/upload.service.js')
  const { ProjectsController } = compiled('modules/projects/projects.controller.js')
  const { ProjectsService } = compiled('modules/projects/projects.service.js')
  const { SessionAuthGuard } = compiled('modules/auth/guards/session-auth.guard.js')
  const { SessionTokenService } = compiled('modules/auth/session/session-token.service.js')
  const { SessionStoreService } = compiled('modules/auth/session/session-store.service.js')
  const { AuthRepository } = compiled('modules/auth/auth.repository.js')
  const { AccessGuard } = compiled('modules/access/access.guard.js')
  const { AccessService } = compiled('modules/access/access.service.js')
  const { ACCESS_ERRORS } = compiled('modules/access/access.errors.js')
  const { AppException } = compiled('common/exceptions/app.exception.js')
  const { createFastifyAdapter } = compiled('common/adapters/fastify.adapter.js')
  const publicUser = { id: randomUUID(), account: 'schema_smoke', name: '迁移测试用户' }
  const companyId = randomUUID()
  const projectId = randomUUID()
  const uploadSessionId = randomUUID()
  const authorization = 'Bearer schema-smoke-fixture'
  const seen = {}
  let invalidResponse = false
  let denyAccess = false
  const checks = []
  const nativeProviders = Reflect.getMetadata('providers', AppModule).filter((provider) =>
    [APP_PIPE, APP_INTERCEPTOR, APP_FILTER].includes(provider?.provide),
  )
  ensure(nativeProviders.length === 3, '必须复用 AppModule 的三个原生全局 provider')
  const auth = {
    /** 返回包含内部字段的测试对象，验证响应白名单。 */
    async register(body) {
      seen.register = body
      return { ...publicUser, passwordHash: 'fixture-internal-field' }
    },
    /** 提供确定的测试结果；开关用于触发真实响应序列化错误。 */
    async login(body) {
      seen.login = body
      return invalidResponse
        ? { tokenType: 'Bearer' }
        : {
            accessToken: 'fixture-response-token',
            tokenType: 'Bearer',
            idleExpiresIn: 600,
            absoluteExpiresAt: '2030-01-01T00:00:00.000Z',
            internal: 'fixture-internal-field',
          }
    },
    /** 模拟公开用户查询，额外私有字段必须由响应 Schema 去除。 */
    async getCurrentUser() {
      return { ...publicUser, passwordHash: 'fixture-internal-field' }
    },
    /** 模拟幂等退出，额外字段不应出现在 HTTP 响应中。 */
    async logout() {
      return { loggedOut: true, internal: 'fixture-internal-field' }
    },
    /** 保存通过跨字段校验的改密参数并返回固定结果。 */
    async changePassword(userId, body) {
      seen.changePassword = { userId, body }
      return { passwordChanged: true, internal: 'fixture-internal-field' }
    },
  }
  const uploads = {
    /** 保存经 Body Schema 转换的初始化参数。 */
    async initiate(ownerId, body) {
      seen.initiate = { ownerId, body }
      return { uploadSessionId }
    },
    /** 记录校验后的会话 ID，验证 Param 对象的绑定。 */
    async getStatus(ownerId, id) {
      seen.uploadStatus = { ownerId, id }
      return { uploadSessionId: id }
    },
    /** 逐块消费原始流，确认 Param 数值转换且未被 JSON Schema 处理。 */
    async uploadPart(input) {
      seen.uploadPart = input
      let byteLength = 0
      for await (const chunk of input.body) byteLength += chunk.length
      return { partNumber: input.partNumber, byteLength }
    },
    /** 模拟完成返回，不连接对象存储。 */
    async complete(ownerId, id) {
      return { ownerId, uploadSessionId: id, completed: true }
    },
    /** 模拟取消返回，不写入存储或数据库。 */
    async abort(ownerId, id) {
      return { ownerId, uploadSessionId: id, aborted: true }
    },
  }
  const projects = {
    /** 保存分页参数，验证 default、coerce 与 trim。 */
    async listProjects(input) {
      seen.projectQuery = input.query
      return { items: [], total: 0, page: input.query.page, pageSize: input.query.pageSize }
    },
    /** 保存项目创建参数，检查严格对象与字段转换。 */
    async create(input) {
      seen.createProject = input.body
      return { id: projectId }
    },
    /** 保存资料参数，验证参数 Pipe 不改变路由和身份。 */
    async profile(input) {
      seen.profile = input
      return { id: projectId }
    },
    /** 提供项目详情测试响应。 */
    async get() {
      return { id: projectId }
    },
    /** 保存经过校验的项目状态参数。 */
    async status(input) {
      seen.status = input.body
      return { id: projectId, status: input.body.status }
    },
    /** 保存经过校验的管理员设置参数。 */
    async setAdministrator(input) {
      seen.administrator = input.body
      return { administrator: { id: input.body.administratorUserId } }
    },
    /** 提供管理员列表测试响应。 */
    async projectAdministrators() {
      return []
    },
  }
  Logger.overrideLogger(false)
  const module = await Test.createTestingModule({
    controllers: [AuthController, UploadController, ProjectsController],
    providers: [
      ...nativeProviders,
      { provide: APP_GUARD, useClass: SessionAuthGuard },
      { provide: APP_GUARD, useClass: AccessGuard },
      { provide: AuthService, useValue: auth },
      { provide: UploadService, useValue: uploads },
      { provide: ProjectsService, useValue: projects },
      {
        provide: SessionTokenService,
        useValue: {
          /** 仅识别此工具的虚构 Bearer 凭据。 */
          extractBearerToken(value) {
            return value === authorization ? 'fixture' : undefined
          },
          digest: () => 'fixture-digest',
        },
      },
      {
        provide: SessionStoreService,
        useValue: {
          /** 提供测试身份，不连接 Redis 或延长真实会话。 */
          async validateAndTouch() {
            return { userId: publicUser.id, terminal: 'web', sessionId: randomUUID() }
          },
        },
      },
      {
        provide: AuthRepository,
        useValue: { findPublicById: async () => ({ ...publicUser, status: 'active' }) },
      },
      {
        provide: AccessService,
        useValue: {
          /** 让真实 AccessGuard 解析策略，替身只控制权限允许或拒绝。 */
          async read(policy, callback) {
            seen.policy = policy
            if (denyAccess) throw new AppException(ACCESS_ERRORS.FORBIDDEN)
            return callback()
          },
        },
      },
    ],
  }).compile()
  const adapter = createFastifyAdapter()
  const app = module.createNestApplication(adapter, { logger: false })
  /** 执行 HTTP 注入并断言状态、请求 ID 和错误契约，只记录安全摘要。 */
  async function request({
    name,
    method = 'GET',
    url,
    payload,
    expected = 200,
    authenticated = false,
    binary = false,
  }) {
    const response = await adapter.getInstance().inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload }),
      headers: {
        ...(authenticated ? { authorization } : {}),
        ...(binary ? { 'content-type': 'application/octet-stream' } : {}),
      },
    })
    assert.equal(response.statusCode, expected, name)
    ensure(response.headers['x-request-id'], name + ': 缺少请求 ID')
    const body = response.json()
    if (expected >= 400) {
      ensure(typeof body.code === 'string' && typeof body.message === 'string', name + ': 错误契约')
      if (expected === 400) assert.equal(body.code, 'COMMON.VALIDATION_FAILED', name)
    }
    checks.push({ name, status: response.statusCode, requestIdPresent: true })
    return { body, response }
  }
  try {
    await app.init()
    await adapter.getInstance().ready()
    const registered = await request({
      name: '注册 trim 与白名单',
      method: 'POST',
      url: '/auth/register',
      expected: 201,
      payload: { account: ' schema_smoke ', name: ' 测试用户 ', password: 'fixture123' },
    })
    ensure(
      seen.register.account === 'schema_smoke' && seen.register.name === '测试用户',
      '注册 trim',
    )
    assert.deepEqual(Object.keys(registered.body).sort(), ['account', 'id', 'name'])
    const login = await request({
      name: '登录 trim 与响应白名单',
      method: 'POST',
      url: '/auth/login',
      payload: { account: ' schema_smoke ', password: 'fixture123', terminal: 'web' },
    })
    ensure(
      seen.login.account === 'schema_smoke' && !('internal' in login.body),
      '登录字段转换与筛选',
    )
    const invalidLogin = await request({
      name: '登录校验错误与 Zod code',
      method: 'POST',
      url: '/auth/login',
      expected: 400,
      payload: { account: 'a', password: '' },
    })
    ensure(
      invalidLogin.body.details.some(
        (detail) => detail.path === 'account' && detail.code === 'too_small',
      ),
      'Zod issue code',
    )
    const me = await request({ name: '当前用户响应白名单', url: '/auth/me', authenticated: true })
    assert.deepEqual(Object.keys(me.body).sort(), ['account', 'id', 'name', 'terminal'])
    const unauthorized = await request({
      name: '认证守卫与 Bearer 质询',
      url: '/auth/me',
      expected: 401,
    })
    ensure(unauthorized.response.headers['www-authenticate']?.startsWith('Bearer'), 'Bearer 质询')
    const logout = await request({
      name: '幂等退出响应白名单',
      url: '/auth/logout',
      method: 'POST',
    })
    assert.deepEqual(logout.body, { loggedOut: true })
    const mismatch = await request({
      name: '改密跨字段错误',
      url: '/auth/change-password',
      method: 'POST',
      expected: 400,
      authenticated: true,
      payload: {
        oldPassword: 'fixture-old',
        newPassword: 'fixture-new',
        confirmPassword: 'mismatch',
      },
    })
    ensure(
      mismatch.body.details.some(
        (detail) => detail.path === 'confirmPassword' && detail.code === 'custom',
      ),
      '确认密码错误路径',
    )
    const changed = await request({
      name: '改密成功响应白名单',
      url: '/auth/change-password',
      method: 'POST',
      authenticated: true,
      payload: {
        oldPassword: 'fixture-old',
        newPassword: 'fixture-new',
        confirmPassword: 'fixture-new',
      },
    })
    assert.deepEqual(changed.body, { passwordChanged: true })
    invalidResponse = true
    const invalid = await request({
      name: '响应 Schema 失败安全 500',
      url: '/auth/login',
      method: 'POST',
      expected: 500,
      payload: { account: 'schema_smoke', password: 'fixture123', terminal: 'web' },
    })
    assert.deepEqual(Object.keys(invalid.body).sort(), ['code', 'message'])
    assert.equal(invalid.body.code, 'COMMON.INTERNAL_SERVER_ERROR')
    ensure(!JSON.stringify(invalid.body).includes('Serialization'), '序列化异常不得公开')
    invalidResponse = false
    await request({
      name: '上传初始化 Body Schema',
      url: '/uploads/multipart',
      method: 'POST',
      expected: 201,
      authenticated: true,
      payload: {
        clientUploadId: randomUUID(),
        fileName: ' fixture.bin ',
        fileSize: 3,
        contentType: ' application/octet-stream ',
      },
    })
    assert.equal(seen.initiate.body.fileName, 'fixture.bin')
    await request({
      name: '上传严格对象',
      url: '/uploads/multipart',
      method: 'POST',
      expected: 400,
      authenticated: true,
      payload: { extra: true },
    })
    await request({
      name: '上传状态 Param',
      url: '/uploads/multipart/' + uploadSessionId,
      authenticated: true,
    })
    await request({
      name: '上传无效 UUID',
      url: '/uploads/multipart/not-a-uuid',
      expected: 400,
      authenticated: true,
    })
    const part = await request({
      name: '上传二进制流与 partNumber 转换',
      url: '/uploads/multipart/' + uploadSessionId + '/parts/2',
      method: 'PUT',
      authenticated: true,
      binary: true,
      payload: Buffer.from([0, 1, 255]),
    })
    assert.equal(part.body.byteLength, 3)
    assert.equal(typeof seen.uploadPart.partNumber, 'number')
    assert.equal(seen.uploadPart.partNumber, 2)
    ensure(typeof seen.uploadPart.body.pipe === 'function', '二进制保持 Readable')
    await request({
      name: '上传完成路由',
      url: '/uploads/multipart/' + uploadSessionId + '/complete',
      method: 'POST',
      authenticated: true,
    })
    await request({
      name: '上传取消路由',
      url: '/uploads/multipart/' + uploadSessionId,
      method: 'DELETE',
      authenticated: true,
    })
    const base = '/companies/' + companyId + '/projects'
    await request({ name: '项目分页默认值', url: base, authenticated: true })
    assert.deepEqual(seen.projectQuery, { page: 1, pageSize: 20 })
    await request({
      name: '项目分页 coerce 和 trim',
      url: base + '?page=2&pageSize=10&query=%20fixture%20',
      authenticated: true,
    })
    assert.deepEqual(seen.projectQuery, { page: 2, pageSize: 10, query: 'fixture' })
    await request({
      name: '项目未知 query 拒绝',
      url: base + '?extra=1',
      expected: 400,
      authenticated: true,
    })
    await request({
      name: '项目非法分页拒绝',
      url: base + '?page=0',
      expected: 400,
      authenticated: true,
    })
    await request({
      name: '权限守卫提前校验 ID',
      url: '/companies/not-a-uuid/projects',
      expected: 400,
      authenticated: true,
    })
    denyAccess = true
    const denied = await request({
      name: '权限拒绝先于参数 Pipe',
      url: base + '?page=0',
      expected: 403,
      authenticated: true,
    })
    assert.equal(denied.body.code, ACCESS_ERRORS.FORBIDDEN.code)
    denyAccess = false
    await request({
      name: '项目创建 Body Schema',
      url: base,
      method: 'POST',
      expected: 201,
      authenticated: true,
      payload: {
        name: ' 测试项目 ',
        code: 'fixture_project',
        administratorUserId: publicUser.id,
        organizationInitialization: { mode: 'blank' },
      },
    })
    assert.equal(seen.createProject.name, '测试项目')
    await request({
      name: '项目资料 Body Schema',
      url: base + '/' + projectId,
      method: 'PATCH',
      authenticated: true,
      payload: { name: ' 更新名称 ', expectedVersion: 1 },
    })
    assert.equal(seen.profile.body.name, '更新名称')
    await request({ name: '项目详情路由', url: base + '/' + projectId, authenticated: true })
    await request({
      name: '项目状态 Body Schema',
      url: base + '/' + projectId + '/status',
      method: 'PATCH',
      authenticated: true,
      payload: { status: 'disabled', expectedVersion: 1 },
    })
    await request({
      name: '项目管理员 Body Schema',
      url: base + '/' + projectId + '/administrator',
      method: 'POST',
      authenticated: true,
      payload: { administratorUserId: publicUser.id },
    })
    await request({
      name: '项目管理员列表路由',
      url: base + '/' + projectId + '/administrators',
      authenticated: true,
    })
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Schema migration smoke')
        .setVersion('12')
        .addBearerAuth({}, 'session')
        .build(),
    )
    /** 解引用 Swagger 组件，断言原生 Standard Schema 生成的字段。 */
    function dereference(schema) {
      return schema?.$ref ? document.components.schemas[schema.$ref.split('/').pop()] : schema
    }
    const swagger = []
    for (const [path, method, status, fields] of [
      ['/auth/register', 'post', '201', ['id', 'account', 'name']],
      [
        '/auth/login',
        'post',
        '200',
        ['accessToken', 'tokenType', 'idleExpiresIn', 'absoluteExpiresAt'],
      ],
      ['/auth/me', 'get', '200', ['id', 'account', 'name', 'terminal']],
      ['/auth/logout', 'post', '200', ['loggedOut']],
      ['/auth/change-password', 'post', '200', ['passwordChanged']],
    ]) {
      const operation = document.paths[path][method]
      const response = dereference(operation.responses[status].content['application/json'].schema)
      assert.deepEqual(Object.keys(response.properties).sort(), fields.sort(), path + ' 响应文档')
      if (['/auth/register', '/auth/login', '/auth/change-password'].includes(path)) {
        ensure(
          dereference(operation.requestBody.content['application/json'].schema).properties,
          path + ' 请求文档',
        )
      }
      swagger.push({
        path,
        method,
        responseFields: fields,
        requestSchemaPresent: Boolean(operation.requestBody),
      })
    }
    const binarySchema =
      document.paths['/uploads/multipart/{uploadSessionId}/parts/{partNumber}'].put.requestBody
        .content['application/octet-stream'].schema
    assert.equal(binarySchema.format, 'binary')
    const projectPath = '/companies/{companyId}/projects'
    const queryParameters = document.paths[projectPath].get.parameters.map(
      (parameter) => parameter.name,
    )
    ensure(
      queryParameters.includes('page') && queryParameters.includes('pageSize'),
      '项目分页 Swagger',
    )
    ensure(document.paths[projectPath].post.requestBody, '项目创建 Swagger')
    const projectOperations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith(projectPath))
      .reduce(
        (total, [, operations]) =>
          total +
          Object.keys(operations).filter((method) => ['get', 'post', 'patch'].includes(method))
            .length,
        0,
      )
    assert.equal(projectOperations, 7, '项目七个路由')
    saveEvidence('http-swagger.json', {
      checkedAt: new Date().toISOString(),
      node: process.version,
      versions: Object.fromEntries(
        ['@nestjs/common', '@nestjs/core', '@nestjs/swagger'].map((name) => [
          name,
          JSON.parse(
            readFileSync(resolve(serverRoot, 'node_modules', name, 'package.json'), 'utf8'),
          ).version,
        ]),
      ),
      mode: 'compiled controllers, actual global providers and guards, in-memory business/session/access substitutes',
      externalServicesConnected: false,
      checks,
      swagger,
      uploadBinarySchema: binarySchema,
      projectQueryParameters: queryParameters,
      projectOperations,
      passed: true,
    })
    console.log(
      JSON.stringify({
        passed: true,
        httpChecks: checks.length,
        authSwaggerResponses: swagger.length,
        projectOperations,
      }),
    )
  } finally {
    await app.close()
  }
}

/** 将工具错误作为失败退出，不输出可能包含输入正文的断言对象。 */
async function main() {
  if (process.argv.includes('--commonjs')) checkCommonjs()
  else await checkHttp()
}
main().catch((error) => {
  console.error(error.name + ': ' + error.message)
  process.exitCode = 1
})
