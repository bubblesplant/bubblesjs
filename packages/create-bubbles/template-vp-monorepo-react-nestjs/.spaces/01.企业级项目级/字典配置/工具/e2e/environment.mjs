import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

/** 获取本机空闲端口，避免中断用户正在运行的前后端服务。 */
async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise((done) => server.close(done))
  return port
}

/** 管理本次独占的数据库、服务进程与 Redis 键；真实认证依赖不使用替身。 */
export function createEnvironment({ repoRoot, report }) {
  const serverRoot = resolve(repoRoot, 'apps/server')
  const webRoot = resolve(repoRoot, 'apps/web')
  const requireServer = createRequire(resolve(serverRoot, 'package.json'))
  const requireWeb = createRequire(resolve(webRoot, 'package.json'))
  const { config } = requireServer('dotenv')
  for (const name of ['.env.development.local', '.env.local', '.env.development', '.env'])
    config({ path: resolve(serverRoot, name), quiet: true })
  const { Pool } = requireServer('pg')
  const Redis = requireServer('ioredis').default
  const { drizzle } = requireServer('drizzle-orm/node-postgres')
  const { migrate } = requireServer('drizzle-orm/node-postgres/migrator')
  const runId = randomUUID().replaceAll('-', '')
  const databaseName = `dictionary_e2e_${runId}`
  const queuePrefix = `bubbles:dictionary_e2e:${runId}:queue`
  const pepper = randomBytes(48).toString('base64url')
  const password = randomBytes(10).toString('base64url')
  const sessions = new Set()
  const userIds = new Set()
  const cleanup = (report.cleanup = {})
  let adminPool, pool, redis, queueRedis, child, web
  let databaseCreated = false
  let serverLog = ''
  let apiBase = ''
  const state = { users: {}, tokens: {}, password }

  /** 删除输出中的连接凭据与本次生成的密码、会话和服务密钥。 */
  function redact(value) {
    let result = String(value)
    const secrets = [password, pepper, ...sessions]
    for (const [key, secret] of Object.entries(process.env))
      if (/PASSWORD|PEPPER|SECRET|API_KEY|DATABASE_URL/.test(key) && secret) secrets.push(secret)
    for (const secret of secrets) result = result.replaceAll(secret, '[REDACTED]')
    return result.replace(/Bearer\s+[A-Za-z0-9_-]+/g, 'Bearer [REDACTED]')
  }

  /** 调用真实后端并校验状态，只向报告累计请求数，不输出认证正文。 */
  async function api({ path, token, method = 'GET', body, status = 200 }) {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    })
    report.directHttpRequests = (report.directHttpRequests || 0) + 1
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${data.code || response.status}`)
    if (path === '/auth/login' && data.accessToken) sessions.add(data.accessToken)
    return data
  }

  /** 启动完整后端与独立前端，依次使用公开注册、初始化命令和登录接口准备测试身份。 */
  async function start() {
    const connection = new URL(process.env.DATABASE_URL)
    assert(['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname), '仅允许本机隔离库')
    assert(/^[a-z0-9_]+$/.test(databaseName))
    adminPool = new Pool({ connectionString: connection.toString(), connectionTimeoutMillis: 3000 })
    await adminPool.query(`CREATE DATABASE "${databaseName}"`)
    databaseCreated = true
    connection.pathname = `/${databaseName}`
    pool = new Pool({ connectionString: connection.toString(), max: 4 })
    await migrate(drizzle(pool), { migrationsFolder: resolve(serverRoot, 'drizzle') })
    Object.assign(process.env, {
      NODE_ENV: 'development',
      DATABASE_URL: connection.toString(),
      DB_HOST: connection.hostname.replace(/^\[|\]$/g, ''),
      DB_PORT: connection.port || '5432',
      DB_DATABASE: databaseName,
      DB_USERNAME: decodeURIComponent(connection.username),
      DB_PASSWORD: decodeURIComponent(connection.password),
      SESSION_TOKEN_PEPPER: pepper,
      QUEUE_WORKER_ENABLED: 'false',
      QUEUE_PREFIX: queuePrefix,
    })
    const sessionRedis = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
    }
    const queueConnection = {
      host: process.env.QUEUE_REDIS_HOST || 'localhost',
      port: Number(process.env.QUEUE_REDIS_PORT || 6379),
      username: process.env.QUEUE_REDIS_USERNAME || undefined,
      password: process.env.QUEUE_REDIS_PASSWORD || undefined,
      db: Number(process.env.QUEUE_REDIS_DB || 1),
    }
    for (const entry of [sessionRedis, queueConnection])
      assert(['localhost', '127.0.0.1', '::1'].includes(entry.host), '仅连接本机测试 Redis')
    redis = new Redis({ ...sessionRedis, protocol: 2, lazyConnect: true, maxRetriesPerRequest: 1 })
    queueRedis = new Redis({
      ...queueConnection,
      protocol: 2,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    })
    await redis.connect()
    await queueRedis.connect()
    assert.equal(await redis.ping(), 'PONG')
    const apiPort = await availablePort()
    apiBase = `http://127.0.0.1:${apiPort}`
    child = spawn(process.execPath, [resolve(serverRoot, 'dist/main.js')], {
      cwd: serverRoot,
      windowsHide: true,
      env: { ...process.env, PORT: String(apiPort), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk) => {
        serverLog = `${serverLog}${chunk}`.slice(-12000)
      })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(redact(`后端启动失败：${serverLog}`))
      try {
        const response = await fetch(`${apiBase}/api-docs-json`, {
          signal: AbortSignal.timeout(1000),
        })
        if (response.ok) {
          const specification = await response.json()
          assert(specification.paths['/dictionary-options'])
          ready = true
          break
        }
      } catch {
        /* 服务启动完成前允许短暂连接失败。 */
      }
      await delay(300)
    }
    assert(ready, redact(`后端启动超时：${serverLog}`))
    for (const [kind, name] of [
      ['admin', '测试平台管理员'],
      ['company', '测试企业管理员'],
      ['outsider', '测试外部用户'],
    ]) {
      state.users[kind] = await api({
        path: '/auth/register',
        method: 'POST',
        status: 201,
        body: {
          account: `dict_e2e_${kind}`,
          name,
          password,
        },
      })
      userIds.add(state.users[kind].id)
    }
    await promisify(execFile)(
      process.execPath,
      [
        '-r',
        requireServer.resolve('ts-node/register/transpile-only'),
        '-r',
        requireServer.resolve('tsconfig-paths/register'),
        resolve(serverRoot, 'src/access-init.ts'),
        '--account',
        state.users.admin.account,
      ],
      {
        cwd: serverRoot,
        windowsHide: true,
        timeout: 30000,
        env: { ...process.env, TS_NODE_PROJECT: resolve(serverRoot, 'tsconfig.scripts.json') },
      },
    )
    for (const kind of Object.keys(state.users)) {
      const result = await api({
        path: '/auth/login',
        method: 'POST',
        body: {
          account: state.users[kind].account,
          password,
        },
      })
      state.tokens[kind] = result.accessToken
    }
    state.company = await api({
      path: '/platform/companies',
      method: 'POST',
      status: 201,
      token: state.tokens.admin,
      body: {
        code: 'dictionary_e2e',
        name: '字典验收测试企业',
        administratorUserId: state.users.company.id,
      },
    })
    state.project = await api({
      path: `/companies/${state.company.id}/projects`,
      method: 'POST',
      status: 201,
      token: state.tokens.company,
      body: {
        code: 'dictionary_e2e',
        name: '字典验收测试项目',
        administratorUserId: state.users.company.id,
        organizationInitialization: { mode: 'blank' },
      },
    })
    state.scopes = [
      { type: 'platform' },
      { type: 'company', companyId: state.company.id },
      { type: 'project', companyId: state.company.id, projectId: state.project.id },
    ]
    const webPort = await availablePort()
    process.env.VITE_API_URL = apiBase
    process.env.VITE_PORT = String(webPort)
    process.env.VITE_API_AFFIX = '/api'
    process.chdir(webRoot)
    const { createServer: createViteServer } = requireWeb('vite-plus')
    web = await createViteServer({
      configFile: resolve(webRoot, 'vite.config.ts'),
      root: webRoot,
      mode: 'dev',
      server: { port: webPort, host: '127.0.0.1', strictPort: true },
    })
    await web.listen()
    state.baseUrl = `http://127.0.0.1:${webPort}`
    report.environment = {
      database: '随机隔离 PostgreSQL',
      redis: '真实本机 Redis，精确清理本次键',
      mockHttp: false,
      fullApp: true,
    }
    report.checks.push(
      '完整 AppModule 启动、公开注册、官方平台初始化、真实 Redis 登录、真实企业及项目创建',
    )
    console.log('隔离环境已就绪；真实认证与组织初始化通过。')
    return state
  }

  /** 验证本次登录确实建立了 Redis 会话，报告仅保存检查结论。 */
  async function sessionExists(token) {
    return await redis.exists(
      `auth:v1:session:${createHmac('sha256', pepper).update(token).digest('hex')}`,
    )
  }

  /** 记录浏览器真实登录产生的令牌，仅在内存中用于精确清理。 */
  function rememberToken(token) {
    sessions.add(token)
  }

  /** 查询隔离数据库中的真实记录，禁止将连接凭据写入报告。 */
  async function query(text, values) {
    return pool.query(text, values)
  }

  /** 停止本工具创建的服务，并只清理随机隔离库及本次精确会话／队列键。 */
  async function dispose() {
    const errors = []
    /** 分步清理，使某一步失败时其余资源仍能释放。 */
    async function step(name, action) {
      try {
        await action()
        cleanup[name] = true
      } catch (error) {
        cleanup[name] = false
        errors.push({ step: name, message: redact(error.message) })
      }
    }
    if (web) await step('frontendStopped', () => web.close())
    if (child && child.exitCode === null)
      await step('backendStopped', async () => {
        const stopped = once(child, 'exit')
        child.kill()
        await stopped
      })
    if (redis)
      await step('sessionKeysRemoved', async () => {
        const keys = [...sessions].map(
          (token) => `auth:v1:session:${createHmac('sha256', pepper).update(token).digest('hex')}`,
        )
        for (const id of userIds)
          for (const terminal of ['web', 'mobile', 'desktop'])
            keys.push(`auth:v1:slot:${id}:${terminal}`)
        if (keys.length) {
          await redis.del(...keys)
          assert.equal(await redis.exists(...keys), 0)
        }
      })
    if (queueRedis)
      await step('queueKeysRemoved', async () => {
        assert.equal(queuePrefix, `bubbles:dictionary_e2e:${runId}:queue`)
        let cursor = '0'
        do {
          const result = await queueRedis.scan(cursor, 'MATCH', `${queuePrefix}:*`, 'COUNT', 100)
          cursor = result[0]
          if (result[1].length) await queueRedis.del(...result[1])
        } while (cursor !== '0')
      })
    for (const client of [redis, queueRedis]) if (client) client.disconnect()
    if (pool) await step('databasePoolClosed', () => pool.end())
    if (databaseCreated)
      await step('databaseRemoved', async () => {
        assert.equal(databaseName, `dictionary_e2e_${runId}`)
        assert(/^dictionary_e2e_[a-f0-9]{32}$/.test(databaseName))
        await adminPool.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
          [databaseName],
        )
        await adminPool.query(`DROP DATABASE "${databaseName}"`)
        assert.equal(
          (await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]))
            .rowCount,
          0,
        )
      })
    if (adminPool) await step('adminPoolClosed', () => adminPool.end())
    if (errors.length) report.cleanupErrors = errors
    return errors
  }

  return { start, dispose, api, state, redact, rememberToken, sessionExists, query }
}
