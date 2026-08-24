# NestJS 11 Server 剩余改造操作手册

> 适用目录：`apps/server`  
> 技术栈：NestJS 11 + Fastify 5 + Redis Session + Drizzle/PostgreSQL + nestjs-zod + Vite+  
> 基线日期：2026-08-24  
> 目标：完成统一异常处理改造的剩余工作，并让 Server 达到可测试、可构建、可上线的状态。

## 1. 先看结论

当前统一异常框架主体已经存在，但还不能上线。请严格按下面顺序修改：

1. 先下线会泄漏密码 Hash、允许任意读写 Redis 的测试接口。
2. 修复 Redis Lua 的三个 P0 错误。
3. 统一 `SessionStoreService` 的 503 异常边界。
4. 修复数据库和 Argon2 异常映射。
5. 改成服务端生成 UUID Request ID，并限制可信代理。
6. 修正登录/退出状态码。
7. 给成功响应增加运行时 DTO，真正启用 Zod 防泄漏。
8. 补全 Swagger 失败协议和响应 Header。
9. 补齐单元测试、真实 Redis 脚本测试和 Fastify HTTP 契约测试。
10. 修复 Vite+、锁文件、格式和旧文档。

推荐一小步一提交，不要把 P0 修复、格式化全仓和旧文档清理混在同一个提交里。

## 2. 完成标准

改造完成后必须同时满足：

- 登录取得的 Token 可以正常访问 `/auth/me`。
- 同一用户、同一终端二次登录成功，旧 Token 401，新 Token 200。
- 不存在或过期的 Session 返回 401，而不是 503。
- 普通用户无法访问任何 DB/Redis 调试接口。
- 数据库、Redis、Argon2 故障统一返回安全的模块级 503。
- 每个 HTTP 响应都有服务端生成的 UUID `X-Request-Id`。
- 成功正文保持原始业务结构，失败正文固定为 `code/message/details?`。
- 响应 DTO 可以过滤额外敏感字段。
- Server 测试不再显示 `No test files found`。
- 最终验证命令全部通过。

## 3. 第 0 步：记录基线

在仓库根目录执行：

```powershell
git status --short
vp env doctor
vp install
```

当前 `vp install` 可能提示 `apps/server/package.json` 与 `pnpm-lock.yaml` 不同步，这是已知问题，不要用 `--no-lockfile` 掩盖。完成第 2 步的依赖归类后，再重新执行 `vp install` 并提交锁文件。

建议先创建自己的修复分支：

```powershell
git switch -c codex/server-error-boundary-finish
```

如果你不准备新建分支，至少先确认 `git status --short` 没有自己尚未保存的改动。

---

## 4. 第 1 步：立即下线 DB/Redis 调试接口

### 4.1 修改 AppModule

文件：

```text
apps/server/src/app.module.ts
```

删除：

```ts
import { TestDbModule } from './modules/test/db/db.module'
import { TestRedisModule } from './modules/test/redis/redis.module'
```

同时从 `imports` 中删除：

```ts
TestRedisModule,
TestDbModule,
```

原因：

- `/db/users` 会返回包含 `passwordHash` 的完整数据库记录。
- `/redis/get` 和 `/redis/set` 允许调用方操作任意 Redis key。
- 全局 Session Guard 只能证明“已经登录”，不能证明调用方是管理员。
- 当前全局 `ZodSerializerInterceptor` 没有响应 DTO 元数据，不能自动阻止泄漏。

### 4.2 删除死代码

确认没有其他用途后，删除：

```text
apps/server/src/modules/test/db/
apps/server/src/modules/test/redis/
```

不要只增加 `@Public()`、环境变量判断或隐藏 Swagger 标签。最安全的模板默认值是这些路由根本不进入正式应用。

如果以后确实需要健康检查，应单独实现只返回固定状态的 `/health/db` 和 `/health/redis`，不要返回用户行，也不要允许调用方传 Redis key。

### 4.3 验收

```powershell
rg -n "TestDbModule|TestRedisModule|@Controller\('(db|redis)'" apps/server/src
vp run --filter server --fail-if-no-match build
```

第一条命令应无匹配；构建应通过。启动应用后还要确认：

- 携带有效 Token 访问 `/db/*`、`/redis/*` 仍然返回 404。
- Swagger 不再出现“DB 测试”和“Redis 测试”接口。
- 生产 `AppModule` 不再引用 `modules/test`。

建议提交：

```text
fix(server): remove unsafe db and redis debug routes
```

---

## 5. 第 2 步：先修好 Vite+ 测试基础设施

这一步先让后面的回归测试能够正常运行。

### 5.1 修正 Server package.json

文件：

```text
apps/server/package.json
```

把格式脚本改成 Vite+：

```json
{
  "scripts": {
    "format": "vp fmt",
    "test": "vp test"
  }
}
```

把 `vite-plus` 从 `dependencies` 移到 `devDependencies`：

```json
{
  "devDependencies": {
    "vite-plus": "catalog:"
  }
}
```

不要依赖根包“刚好能向上解析到” Vite+，因为 `apps/server/vite.config.ts` 自己直接导入了 `vite-plus`。

部署补充：

- `@nestjs/swagger` 在 Controller 和 `main.ts` 中是运行时导入。
- 如果生产环境只安装 `dependencies`，应把 `@nestjs/swagger` 移入 `dependencies`。
- 如果生产环境继续提供 Swagger UI，`@fastify/static` 也应作为运行时依赖。
- 不要只用 `NODE_ENV` 包住 Swagger 初始化，却仍保留顶层静态导入，然后误以为生产不需要该依赖。

### 5.2 修复 vite.config.ts 的类型检查

当前 `apps/server/package.json` 没有 `"type": "module"`，Server 构建产物也是 CommonJS。不要为了消除 `import.meta` 报错直接增加 `"type": "module"`，否则现有 SWC CommonJS 产物可能无法运行。

将：

```ts
import { fileURLToPath } from 'node:url'
```

改为：

```ts
import { resolve } from 'node:path'
```

将 alias 改为：

```ts
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    restoreMocks: true,
  },
})
```

继续使用同一个 `vite.config.ts`。不要另建 `vitest.config.ts`、Oxlint 配置或 Prettier 配置。

### 5.3 更新锁文件

```powershell
vp install
git diff -- apps/server/package.json pnpm-lock.yaml
```

确认 `pnpm-lock.yaml` 的 `apps/server` importer 已出现 `vite-plus`，并且位于 `devDependencies`。

### 5.4 建立第一条可运行测试

新建：

```text
apps/server/test/error-catalog.spec.ts
```

内容可以从下面开始：

```ts
import { COMMON_ERRORS } from '@/common/error/common.error'
import { AUTH_ERRORS } from '@/modules/auth/auth.errors'
import { describe, expect, it } from 'vite-plus/test'

const definitions = [...Object.values(COMMON_ERRORS), ...Object.values(AUTH_ERRORS)]

describe('error catalog', () => {
  it('uses valid and globally unique error codes', () => {
    const codes = definitions.map((definition) => definition.code)

    expect(new Set(codes).size).toBe(codes.length)

    for (const definition of definitions) {
      expect(definition.code).toMatch(/^[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)+$/)
      expect(definition.code.length).toBeLessThanOrEqual(80)
      expect(definition.status).toBeGreaterThanOrEqual(400)
      expect(definition.status).toBeLessThanOrEqual(599)
      expect(definition.publicMessage.trim()).not.toBe('')
    }
  })

  it('keeps bearerChallenge and HTTP 401 in sync', () => {
    for (const definition of definitions) {
      const hasBearerChallenge =
        'bearerChallenge' in definition && definition.bearerChallenge === true

      expect(hasBearerChallenge).toBe(definition.status === 401)
    }
  })
})
```

运行：

```powershell
vp run --filter server --fail-if-no-match test
```

不要添加 `--passWithNoTests`，那只会掩盖测试没有落地。

---

## 6. 第 3 步：修复 Redis Lua 的三个 P0 错误

文件：

```text
apps/server/src/modules/auth/session/session.script.ts
```

### 6.1 统一 digest 校验函数

在需要校验 digest 的脚本中增加：

```lua
local function isValidDigest(value)
  return value
    and string.len(value) == 64
    and string.match(value, '^[0-9a-f]+$') ~= nil
end
```

至少用于：

- `newDigest`。
- `currentDigest`。
- slot 中读出的 `oldDigest`。
- 批量撤销脚本读取的 digest。

把批量撤销脚本中的：

```lua
string.match(digest, '[0-9a-f]+$')
```

改成带开头锚点的校验，不要接受“只有末尾是十六进制”的损坏值。

### 6.2 修复 sessionKeyPrefix

在 `CREATE_OR_REPLACE_SESSION_SCRIPT` 参数区增加：

```lua
local sessionKeyPrefix = ARGV[8]
```

在任何写操作发生前完成全部验证：

```lua
if not isValidDigest(newDigest)
  or not isValidUserId(userId)
  or not isValidTerminal(terminal)
  or not sessionKeyPrefix
  or sessionKeyPrefix == ''
then
  return { 0, 'INVALID_ARGUMENT' }
end
```

读取旧 digest 后，也要先验证和计算旧 Session key，再执行 `HSET`、`SET`：

```lua
local oldDigest = redis.call('GET', KEYS[1])
local oldSessionKey = nil

if oldDigest then
  if not isValidDigest(oldDigest) then
    return { 0, 'INVALID_SLOT_DATA' }
  end

  oldSessionKey = sessionKeyPrefix .. oldDigest
end
```

完成新 Session 和 slot 写入后，再删除旧 Session：

```lua
if oldSessionKey and oldDigest ~= newDigest then
  redis.call('DEL', oldSessionKey)
end
```

这样做的重点是：所有能够主动发现的协议错误必须发生在首次写操作之前。Redis Lua 运行时错误不会自动回滚此前写入。

// 哈喽 这里是标记

然后修改：

```text
apps/server/src/modules/auth/session/session-store.service.ts
```

在 `authCreateOrReplaceSession` 调用参数末尾追加：

```ts
input.userAgent,
SESSION_KEY_PREFIX,
```

`numberOfKeys` 仍然是 2，不需要修改，因为新增的是 `ARGV`，不是 `KEYS`。

### 6.3 修复 idleTtlMs 拼写

将：

```lua
idleTtlMS <= 0
```

改为：

```lua
idleTtlMs <= 0
```

建议同时改成完整校验：

```lua
if not isValidDigest(currentDigest) or not idleTtlMs or idleTtlMs <= 0 then
  return { 0, 'INVALID_ARGUMENT' }
end
```

### 6.4 修复 NOT_FOUND 状态码

将：

```lua
return { 0, 'NOT_FUND' }
```

改为：

```lua
return { 0, 'NOT_FOUND' }
```

这样 `SessionStoreService` 才会把 Session 不存在识别为正常失效结果，随后由 Guard 返回：

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="api"

{
  "code": "AUTH.SESSION_INVALID",
  "message": "登录已失效，请重新登录"
}
```

### 6.5 必须验收的行为

使用专用测试 Redis，绝对不要对生产 Redis 运行脚本集成测试。

- [ ] 首次登录成功。
- [ ] 首次登录 Token 可以访问 `/auth/me`。
- [ ] 同用户、同终端二次登录成功。
- [ ] 二次登录后旧 Token 返回 401。
- [ ] 二次登录后新 Token 返回 200。
- [ ] 未知但格式合法的 Token 返回 401，不是 503。
- [ ] slot 指向新 digest。
- [ ] 旧 Session key 已删除。
- [ ] 无效参数不会留下部分写入。

建议新增：

```text
apps/server/test/session-script.integration.spec.ts
```

这类错误必须用真实 Redis 执行 Lua 才能可靠发现，单纯 mock Redis 不够。

---

## 7. 第 4 步：统一 SessionStoreService 的异常边界

文件：

```text
apps/server/src/modules/auth/session/session-store.service.ts
```

### 7.1 删除旧异常和 Service 层日志

把导入：

```ts
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
```

改成：

```ts
import { Injectable } from '@nestjs/common'
```

删除：

```ts
private readonly logger = new Logger(SessionStoreService.name)
```

删除所有 `this.logger.error(...)` 和 `new ServiceUnavailableException(...)`。

规则只有一条：Service 负责分类并保留 `cause`，HTTP 最外层 `GlobalExceptionFilter` 负责记录一次 5xx。

### 7.2 为脚本协议错误创建安全 cause

在类外增加：

```ts
const SCRIPT_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,79}$/

function createScriptProtocolError(operation: string, value: string | undefined): Error {
  const code = SCRIPT_CODE_PATTERN.test(value ?? '') ? value : 'UNKNOWN'

  return new Error('Redis ' + operation + ' script returned ' + code)
}
```

不要把以下内容放进错误 message：

- Token 或 token digest。
- 完整 Redis 返回数组。
- 用户输入。
- Redis 地址、密码或连接字符串。

### 7.3 所有异常统一抛 AppException

Redis 命令 reject 或返回非数组时，现有 `execute` 基本正确：

```ts
private async execute(command: () => Promise<unknown>): Promise<string[]> {
  try {
    const result = await command()

    if (!Array.isArray(result)) {
      throw new Error('Redis script returned a non-array result')
    }

    return result.map((item) => String(item ?? ''))
  } catch (cause: unknown) {
    throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, { cause })
  }
}
```

各方法的协议错误也必须使用同一个业务错误定义：

```ts
throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, {
  cause: createScriptProtocolError('createOrReplace', result[1]),
})
```

逐项替换：

| 方法               | 正常业务结果                        | 应映射为 503 的情况              |
| ------------------ | ----------------------------------- | -------------------------------- |
| `createOrReplace`  | 状态 `1` 且两个时间戳有限           | 非成功状态、时间戳非法           |
| `validateAndTouch` | 有效 Session；三种失效码返回 `null` | 未知状态码、userId/terminal 非法 |
| `logout`           | 状态 `1`，包括已退出                | 未知失败状态                     |
| `revokeAllForUser` | 状态 `1`                            | 未知失败状态                     |

正常失效码保持：

```ts
const INVALID_SESSION_CODES = new Set(['NOT_FOUND', 'REPLACED', 'ABSOLUTE_EXPIRED'])
```

另外把：

```ts
SESSION_TERMINALS.map((terminal: any) => ...)
```

改为：

```ts
SESSION_TERMINALS.map((terminal) => ...)
```

### 7.4 单元测试

新建：

```text
apps/server/test/session-store.service.spec.ts
```

至少覆盖：

- Redis reject -> 503 `AUTH.SERVICE_UNAVAILABLE`，并保留 cause。
- Redis 返回非数组 -> 503。
- 创建脚本失败状态 -> 503。
- 创建脚本时间戳非法 -> 503。
- `NOT_FOUND`、`REPLACED`、`ABSOLUTE_EXPIRED` -> `null`。
- 未知校验状态 -> 503。
- 非法 Session payload -> 503。
- logout/revoke 协议异常 -> 503。
- 创建脚本最后一个参数确实是 `SESSION_KEY_PREFIX`。
- Service 不再自行调用 Logger。

---

## 8. 第 5 步：修复 PasswordService 和 AuthService 边界

### 8.1 不再吞掉 Argon2 异常

文件：

```text
apps/server/src/modules/auth/password.service.ts
```

建议固定 Argon2 参数：

```ts
import { Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'

export const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, PASSWORD_HASH_OPTIONS)
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return argon2.verify(passwordHash, password)
  }
}
```

不要捕获所有异常后返回 `false`。Argon2 对普通密码不匹配会正常返回 `false`；非法 Hash 或本地模块故障应继续抛出，由 Auth 边界映射为 503。

现有 dummy hash 的参数是 `m=65536,p=4,t=3`，与上面的固定参数一致。以后调整参数时，要同时重新生成 dummy hash。

### 8.2 给 AuthService 增加基础设施包装器

文件：

```text
apps/server/src/modules/auth/auth.service.ts
```

在类中增加：

```ts
private async useAuthInfrastructure<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (cause: unknown) {
    if (cause instanceof AppException) {
      throw cause
    }

    throw new AppException(AUTH_ERRORS.SERVICE_UNAVAILABLE, { cause })
  }
}
```

然后逐个包住基础设施调用。

注册：

```ts
const passwordHash = await this.useAuthInfrastructure(() =>
  this.passwordService.hash(input.password),
)

const user = await this.useAuthInfrastructure(() =>
  this.authRepository.createUser({
    name: input.name.trim(),
    account,
    passwordHash,
  }),
)

if (!user) {
  throw new AppException(AUTH_ERRORS.ACCOUNT_ALREADY_EXISTS)
}
```

登录：

```ts
const user = await this.useAuthInfrastructure(() => this.authRepository.findByAccount(account))

const passwordHash = user?.status === 'active' ? user.passwordHash : LOGIN_DUMMY_PASSWORD_HASH

const passwordMatches = await this.useAuthInfrastructure(() =>
  this.passwordService.verify(passwordHash, input.password),
)
```

保留统一登录失败判断：

```ts
if (!user || user.status !== 'active' || !passwordMatches) {
  throw new AppException(AUTH_ERRORS.INVALID_CREDENTIALS)
}
```

`getCurrentUser` 也改用同一包装器，删除重复的内联 `catch`。

最终行为必须是：

| 场景                                 | 结果                              |
| ------------------------------------ | --------------------------------- |
| 注册账号冲突，Repository 返回 `null` | 409 `AUTH.ACCOUNT_ALREADY_EXISTS` |
| 账号不存在                           | 422 `AUTH.INVALID_CREDENTIALS`    |
| 账号禁用                             | 422 `AUTH.INVALID_CREDENTIALS`    |
| 密码错误                             | 422 `AUTH.INVALID_CREDENTIALS`    |
| DB 连接失败                          | 503 `AUTH.SERVICE_UNAVAILABLE`    |
| Argon2 Hash/verify 故障              | 503 `AUTH.SERVICE_UNAVAILABLE`    |
| 当前用户已删除或禁用                 | 401 `AUTH.SESSION_INVALID`        |

### 8.3 测试

新增：

```text
apps/server/test/password.service.spec.ts
apps/server/test/auth.service.spec.ts
```

必须覆盖：

- 正确密码返回 `true`。
- 错误密码返回 `false`。
- 非法 Hash 必须 reject，不能 resolve `false`。
- 新生成的 Hash 不需要 `needsRehash`。
- 账号不存在、禁用、密码错误、成功四条路径都恰好调用一次 `verify`。
- Repository、hash、verify 抛错都返回带 cause 的 Auth 503。
- 账号冲突仍然是 409。
- 已经是 `AppException` 的异常不被重复包装。

---

## 9. 第 6 步：修复 Request ID 和 trustProxy

### 9.1 把 Adapter 改成可复用工厂

文件：

```text
apps/server/src/common/adapters/fastify.adapter.ts
```

建议改为：

```ts
import { randomUUID } from 'node:crypto'
import { FastifyAdapter } from '@nestjs/platform-fastify'

export function createFastifyAdapter(): FastifyAdapter {
  const adapter = new FastifyAdapter({
    trustProxy: ['127.0.0.1', '::1'],
    genReqId: () => randomUUID(),
    logger: false,
  })

  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id)
    done()
  })

  return adapter
}
```

如果 Server 不在任何反向代理后面，把 `trustProxy` 设置为 `false`。如果生产使用 Nginx、Traefik 或网关，只配置真实代理 IP/CIDR，不要继续使用 `true`。

不要配置：

```ts
requestIdHeader: 'x-request-id'
```

否则 Fastify 会直接采用调用方提供的值，造成日志伪造和请求关联混乱。

### 9.2 修改 main.ts

文件：

```text
apps/server/src/main.ts
```

改为导入工厂：

```ts
import { createFastifyAdapter } from './common/adapters/fastify.adapter'
```

创建应用时使用新实例：

```ts
const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
  logger: new ConsoleLogger({
    json: process.env.NODE_ENV === 'production',
    colors: process.env.NODE_ENV === 'development',
  }),
})
```

现有 CORS 配置中的：

```ts
exposedHeaders: ['X-Request-Id', 'WWW-Authenticate', 'Retry-After']
```

已经正确，保留即可。

### 9.3 验收

- `X-Request-Id` 必须符合 UUID v4。
- 两个并发请求的 ID 不相同。
- 客户端主动发送 `X-Request-Id: attacker-value` 时，响应不能复用该值。
- 404、204、HEAD、OPTIONS 也应带 Header。
- JSON 正文中不出现 `requestId`。
- 登录记录的 `request.ip` 只能信任明确代理链。

---

## 10. 第 7 步：修正登录和退出状态码

文件：

```text
apps/server/src/modules/auth/auth.controller.ts
```

增加导入：

```ts
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
```

登录增加：

```ts
@HttpCode(HttpStatus.OK)
@Post('login')
```

退出也建议增加：

```ts
@HttpCode(HttpStatus.OK)
@Post('logout')
```

注册保留 Nest POST 默认的 201。

验收：

| 接口                  | 成功状态 |
| --------------------- | -------: |
| `POST /auth/register` |      201 |
| `POST /auth/login`    |      200 |
| `POST /auth/logout`   |      200 |
| `GET /auth/me`        |      200 |

---

## 11. 第 8 步：让 Zod 响应序列化真正生效

当前只注册了 `ZodSerializerInterceptor`，但 Controller 没有提供任何运行时响应 DTO，所以它不会自动过滤敏感字段。

### 11.1 创建 Auth 成功响应 DTO

新建：

```text
apps/server/src/modules/auth/dto/auth-response.dto.ts
```

示例：

```ts
import { createZodDto } from 'nestjs-zod'
import z from 'zod'

const authUserSchema = z.object({
  id: z.string().uuid(),
  account: z.string(),
  name: z.string(),
})

export class RegisterResultDto extends createZodDto(authUserSchema) {}

export class LoginResultDto extends createZodDto(
  z.object({
    accessToken: z.string().min(1),
    tokenType: z.literal('Bearer'),
    idleExpiresIn: z.number().int().positive(),
    absoluteExpiresAt: z.string().datetime(),
  }),
) {}

export class CurrentUserDto extends createZodDto(
  authUserSchema.extend({
    terminal: z.enum(['web', 'desktop', 'mobile']),
  }),
) {}

export class LogoutResultDto extends createZodDto(
  z.object({
    loggedOut: z.literal(true),
  }),
) {}
```

不要给这些 schema 添加 `passthrough()`。默认的对象解析会移除未声明字段，这正是防止意外泄漏的安全边界。

### 11.2 创建失败响应 DTO

新建：

```text
apps/server/src/common/dto/api-failure.dto.ts
```

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class ApiErrorDetailDto {
  @ApiPropertyOptional({ example: 'account' })
  path?: string

  @ApiProperty({ example: 'too_small' })
  code!: string

  @ApiProperty({ example: '账号至少需要 4 个字符' })
  message!: string
}

export class ApiFailureDto {
  @ApiProperty({ example: 'COMMON.VALIDATION_FAILED' })
  code!: string

  @ApiProperty({ example: '请求参数校验失败' })
  message!: string

  @ApiPropertyOptional({
    type: () => [ApiErrorDetailDto],
  })
  details?: ApiErrorDetailDto[]
}
```

### 11.3 统一 Swagger 响应 Header 描述

新建：

```text
apps/server/src/common/openapi/response-headers.ts
```

```ts
export const REQUEST_ID_RESPONSE_HEADERS = {
  'X-Request-Id': {
    description: '服务端生成的请求关联 ID',
    schema: {
      type: 'string',
      format: 'uuid',
    },
  },
}
```

注意：`X-Request-Id` 是响应 Header，不要用 `@ApiHeader`，因为 `@ApiHeader` 描述的是请求 Header。

### 11.4 给 Controller 增加序列化和 OpenAPI 装饰器

以登录为例：

```ts
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import { ZodSerializerDto } from 'nestjs-zod'
import { ApiFailureDto } from '@/common/dto/api-failure.dto'
import { REQUEST_ID_RESPONSE_HEADERS } from '@/common/openapi/response-headers'
import { LoginResultDto } from './dto/auth-response.dto'

@ZodSerializerDto(LoginResultDto)
@ApiOkResponse({
  type: LoginResultDto.Output,
  headers: REQUEST_ID_RESPONSE_HEADERS,
})
@ApiBadRequestResponse({
  type: ApiFailureDto,
  headers: REQUEST_ID_RESPONSE_HEADERS,
})
@ApiUnprocessableEntityResponse({
  type: ApiFailureDto,
  headers: REQUEST_ID_RESPONSE_HEADERS,
})
@ApiServiceUnavailableResponse({
  type: ApiFailureDto,
  headers: REQUEST_ID_RESPONSE_HEADERS,
})
@HttpCode(HttpStatus.OK)
@Post('login')
login(...) {
  // 保留现有业务逻辑
}
```

其他接口按下表声明：

| 接口     | 成功 DTO            | 失败状态      |
| -------- | ------------------- | ------------- |
| register | `RegisterResultDto` | 400、409、503 |
| login    | `LoginResultDto`    | 400、422、503 |
| logout   | `LogoutResultDto`   | 503           |
| me       | `CurrentUserDto`    | 401、503      |

每个成功和失败响应装饰器都声明 `REQUEST_ID_RESPONSE_HEADERS`。

### 11.5 验收防泄漏

在测试 Controller 或 Service mock 中故意多返回：

```ts
{
  id: '合法 UUID',
  account: 'alice',
  name: 'Alice',
  passwordHash: 'should-not-leak',
}
```

HTTP 响应中必须没有 `passwordHash`。如果返回值缺少必填字段或字段类型错误，应触发 `ZodSerializationException`，最终返回安全的 500。

---

## 12. 第 9 步：补齐测试

推荐目录：

```text
apps/server/test/
├─ helpers/create-test-app.ts
├─ fixtures/http-contract.controller.ts
├─ app-exception.spec.ts
├─ error-catalog.spec.ts
├─ global-exception.filter.spec.ts
├─ password.service.spec.ts
├─ auth.service.spec.ts
├─ session-store.service.spec.ts
├─ session-auth.guard.spec.ts
├─ session-script.integration.spec.ts
└─ http-contract.e2e.spec.ts
```

测试统一从 Vite+ 导入：

```ts
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
```

### 12.1 AppException 和错误目录

覆盖：

- 错误码格式。
- 全局唯一性。
- HTTP 状态范围。
- `publicMessage` 非空。
- 401 与 `bearerChallenge` 双向一致。
- 非法错误定义在创建 `AppException` 时抛错。
- `cause` 和 `details` 被保留。

### 12.2 GlobalExceptionFilter

覆盖：

| 输入                                   | 期望                            |
| -------------------------------------- | ------------------------------- |
| `AppException(SESSION_INVALID)`        | 401、稳定正文、Bearer challenge |
| `AppException(ACCOUNT_ALREADY_EXISTS)` | 409                             |
| `ZodValidationException`               | 400、结构化 details             |
| `ZodSerializationException`            | 安全 500，无 details            |
| 旧 `BadRequestException`               | 通用安全 400                    |
| 旧 `ServiceUnavailableException`       | 通用安全 503，不透传 message    |
| 未知 `Error`                           | 安全 500，不返回 stack/message  |

另外断言：

- `X-Request-Id` 等于当前 Fastify request.id。
- Session 401 有 `WWW-Authenticate`。
- 登录 422 没有 `WWW-Authenticate`。
- details 最多 20 条。
- 控制字符被清洗，字段长度受限。
- URI 凭据、Bearer、Cookie、API Key、数据库和 Redis 地址被脱敏。
- 5xx 只记录一次错误日志。
- 正常 4xx 不作为 5xx 错误记录。

### 12.3 Auth 和 Session 单测

覆盖前面第 7、8 节列出的所有分支，尤其是：

- 四条登录路径都只执行一次 Argon2 verify。
- 三种 Session 失效状态返回 `null`。
- Redis/DB/Argon2 故障是带 cause 的 Auth 503。
- Guard 区分 Token 缺失和 Session 无效。
- 两种 Session 401 都带 Bearer challenge。

### 12.4 Fastify HTTP 契约测试

基础 HTTP 契约测试建议使用最小 `TestingModule`，不要直接导入 `AppModule`。直接导入正式模块会触发 PostgreSQL、Redis 和 Session Pepper 配置，使协议测试变成基础设施测试。

使用 `createFastifyAdapter()` 创建独立 Adapter，并通过 `app.inject` 覆盖：

1. 成功对象原样返回。
2. 成功数组原样返回。
3. register 返回 201。
4. login/logout 返回 200。
5. 204 无正文但有 Request ID。
6. HEAD 无正文但有 Request ID。
7. 404 使用统一失败正文。
8. Zod 参数失败返回 details。
9. Session 无效返回 401 和 challenge。
10. 未知异常返回安全 500。
11. 并发 Request ID 不重复、不串线。
12. 调用方提供 Request ID 时，Server 不采用该值。
13. 输出 DTO 会移除额外的 `passwordHash`。

UUID 断言：

```ts
expect(response.headers['x-request-id']).toMatch(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
)
```

### 12.5 真实 Redis 脚本测试

`session-script.integration.spec.ts` 必须连接专用测试 Redis：

- 使用独立 Redis 实例或专用 DB。
- 不要连接开发共享库，更不能连接生产库。
- 测试创建的 key 必须在 `afterEach` 清理。
- 不要在不确定目标库时执行 `FLUSHALL` 或 `FLUSHDB`。
- 覆盖首次登录、同终端替换、过期、未知 digest 和错误参数无部分写入。

---

## 13. 第 10 步：格式、Lint 和旧文档收尾

### 13.1 修复当前 Filter 的 lint warning

文件：

```text
apps/server/src/common/filters/global-exception.filter.ts
```

`sanitizeLogText` 中的控制字符正则前增加：

```ts
// oxlint-disable-next-line no-control-regex
.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ')
```

项目中另一处相同用途已经使用了该注释，保持一致即可。

### 13.2 清理未使用常量

先检查：

```powershell
rg -n "ContentTypeEnum|common/constants/response" apps/server/src
```

如果只有定义处，没有任何引用，删除：

```text
apps/server/src/common/constants/response.ts
```

### 13.3 更新旧协议文档

重点检查：

```text
.spaces/server/登录/session.md
.spaces/server/登录/JWT与RefreshToken轮换鉴权架构实现指南.md
.spaces/server/登录/jwt.md
.spaces/server/todo.md
```

搜索：

```powershell
rg -n "ApiResponse|ResponseInterceptor|ResOp|Bypass|requestId|data\.accessToken" .spaces/server
```

统一为：

```text
成功：Controller 原始业务正文
失败：code/message/details?
请求关联：X-Request-Id 响应头
```

历史说明如果必须保留，应明确标注“已废弃”，并链接到本手册或最终协议文档，不要让两套协议同时看起来都有效。

### 13.4 格式化和定向检查

先只处理 Server/shared：

```powershell
vp check --fix apps/server packages/shared
vp check apps/server packages/shared
```

然后执行全仓检查：

```powershell
vp check
```

当前全仓原本存在较多格式问题。如果全仓检查失败，要区分：

- 本次 Server/shared 引入的问题：本次必须修完。
- 其他 workspace 的历史格式问题：单独清理并记录，不能假装 `vp check` 已通过。

---

## 14. 最终验证顺序

严格按顺序执行：

```powershell
vp install
vp run --filter shared --fail-if-no-match build
vp check apps/server packages/shared
vp run --filter server --fail-if-no-match test
vp run --filter server --fail-if-no-match build
vp check
vp run -r test
vp run -r build
git status --short
```

注意：

- Server 的 `build` 脚本是 `nest build`，所以必须使用 `vp run ... build`。
- 不要用 `vp build` 代替，`vp build` 调用的是 Vite 内置构建。
- `nest build` 当前使用 SWC 且关闭了 typeCheck，构建通过不代表类型检查通过。
- 类型安全以 `vp check` 为准。
- 最终 `git status --short` 应只包含你明确准备提交的文件。

## 15. 最终人工检查清单

### 安全和 Session

- [ ] DB/Redis 调试模块已从 AppModule 移除。
- [ ] 仓库中不再存在可返回 `passwordHash` 的调试路由。
- [ ] `idleTtlMs` 拼写一致。
- [ ] Session 不存在返回 `NOT_FOUND`。
- [ ] 创建脚本显式接收 `SESSION_KEY_PREFIX`。
- [ ] 所有脚本写入前已完成可执行的参数验证。
- [ ] 同终端二次登录不会留下部分状态。
- [ ] 旧 Token 401，新 Token 200。

### 异常边界

- [ ] SessionStore 不再导入 `Logger` 或 `ServiceUnavailableException`。
- [ ] Redis 协议错误统一为带 cause 的 `AUTH.SERVICE_UNAVAILABLE`。
- [ ] DB 和 Argon2 故障统一为 Auth 503。
- [ ] 登录失败仍统一为 `AUTH.INVALID_CREDENTIALS`。
- [ ] 5xx 只在 GlobalExceptionFilter 记录一次。
- [ ] 客户端看不到 SQL、Redis 地址、Token、密码、stack 或原始异常 message。

### HTTP 协议

- [ ] Request ID 是服务端生成的 UUID v4。
- [ ] 不信任调用方传入的 X-Request-Id。
- [ ] trustProxy 只包含真实可信代理。
- [ ] login/logout 返回 200。
- [ ] register 返回 201。
- [ ] 所有响应包含 X-Request-Id。
- [ ] 401 Session 错误包含 WWW-Authenticate。
- [ ] 422 登录失败不包含 WWW-Authenticate。
- [ ] JSON 正文不包含 requestId。
- [ ] 成功响应没有统一 data/code/message 外壳。

### DTO、Swagger 和测试

- [ ] Auth 成功接口均声明运行时 Zod 响应 DTO。
- [ ] 额外 passwordHash 会被响应序列化移除。
- [ ] Zod 输出错误返回安全 500。
- [ ] Swagger 描述真实成功 DTO。
- [ ] Swagger 描述 ApiFailureDto。
- [ ] Swagger 成功和失败响应都声明 X-Request-Id Header。
- [ ] Server 测试目录和测试文件已存在。
- [ ] Lua 使用真实测试 Redis 验证。
- [ ] `vp run --filter server --fail-if-no-match test` 通过。
- [ ] `vp check` 通过。
- [ ] Server 和全仓构建通过。

## 16. 推荐提交拆分

建议按下面粒度提交：

1. `fix(server): remove unsafe debug modules`
2. `chore(server): repair vite-plus test setup`
3. `fix(server): repair redis session scripts`
4. `fix(server): unify auth infrastructure errors`
5. `fix(server): generate trusted request ids`
6. `docs(server): describe response contracts in openapi`
7. `test(server): cover exception and session contracts`
8. `docs(server): remove legacy response protocol references`

不要在没有测试的情况下把三个 Redis Lua 修复压进一次大范围重构；先让失败可以被复现，再逐项修正和验收。
