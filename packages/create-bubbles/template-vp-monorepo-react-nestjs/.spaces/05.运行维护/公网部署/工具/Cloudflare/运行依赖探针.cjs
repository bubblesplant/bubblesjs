const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { once } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const { Worker } = require('node:worker_threads')

/** 生成仅含构建产物及锁定直接依赖的隔离 Linux 验证工程，不复制应用密钥文件。 */
function prepare() {
  const [root, target] = process.argv.slice(3)
  const server = path.join(root, 'apps/server')
  const shared = path.join(root, 'packages/shared')
  const manifest = JSON.parse(fs.readFileSync(path.join(server, 'package.json'), 'utf8'))
  const dependencies = {}
  for (const name of [
    ...Object.keys(manifest.dependencies),
    '@nestjs/swagger',
    '@fastify/static',
  ]) {
    dependencies[name] = JSON.parse(
      fs.readFileSync(path.join(server, 'node_modules', name, 'package.json'), 'utf8'),
    ).version
  }
  dependencies.shared = 'file:./shared'
  fs.writeFileSync(
    path.join(target, 'app/package.json'),
    JSON.stringify({ private: true, dependencies }),
  )
  const sharedManifest = JSON.parse(fs.readFileSync(path.join(shared, 'package.json'), 'utf8'))
  delete sharedManifest.devDependencies
  delete sharedManifest.scripts
  for (const name of Object.keys(sharedManifest.dependencies)) {
    sharedManifest.dependencies[name] = JSON.parse(
      fs.readFileSync(path.join(shared, 'node_modules', name, 'package.json'), 'utf8'),
    ).version
  }
  fs.writeFileSync(path.join(target, 'app/shared/package.json'), JSON.stringify(sharedManifest))

  const dotenv = require(path.join(server, 'node_modules/dotenv'))
  const config = {}
  for (const file of ['.env.development.local', '.env.local', '.env.development', '.env']) {
    const filename = path.join(server, file)
    if (!fs.existsSync(filename)) continue
    const values = dotenv.parse(fs.readFileSync(filename))
    for (const [name, value] of Object.entries(values)) {
      if (!(name in config)) config[name] = value
    }
  }
  for (const name of ['DB_HOST', 'REDIS_HOST', 'QUEUE_REDIS_HOST']) {
    assert.ok(
      ['localhost', '127.0.0.1'].includes(config[name] ?? 'localhost'),
      'Only local services may be probed',
    )
    config[name] = 'host.docker.internal'
  }
  const endpoint = new URL(config.STORAGE_ENDPOINT)
  assert.ok(
    ['localhost', '127.0.0.1'].includes(endpoint.hostname),
    'Only local storage may be probed',
  )
  endpoint.hostname = 'host.docker.internal'
  Object.assign(config, {
    STORAGE_ENDPOINT: endpoint.toString(),
    NODE_ENV: 'production',
    PORT: '3000',
    HOST: '0.0.0.0',
    SESSION_TOKEN_PEPPER: randomBytes(32).toString('hex'),
    QUEUE_WORKER_ENABLED: 'false',
    QUEUE_PREFIX: `codex:cloudflare:${randomBytes(12).toString('hex')}`,
  })
  const allowed = Object.entries(config).filter(([name]) =>
    /^(DB_|REDIS_|QUEUE_|STORAGE_|SESSION_|NODE_ENV$|PORT$|HOST$)/.test(name),
  )
  fs.writeFileSync(
    path.join(target, 'runtime.env'),
    allowed.map(([name, value]) => `${name}=${value}`).join('\n'),
  )
  console.log(JSON.stringify({ prepared: true, directDependencies: dependencies }))
}

/** 在 Linux Node 中验证原生密码摘要、真实摘要线程、只读服务连接及 NestJS 构建入口。 */
async function probe() {
  const { Client } = require('pg')
  const Redis = require('ioredis')
  const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3')
  const argon2 = require('argon2')
  const report = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    checks: {},
  }
  const db = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  })
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
    lazyConnect: true,
    protocol: 2,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  })
  const queueRedis = new Redis({
    host: process.env.QUEUE_REDIS_HOST,
    port: Number(process.env.QUEUE_REDIS_PORT ?? 6379),
    username: process.env.QUEUE_REDIS_USERNAME || undefined,
    password: process.env.QUEUE_REDIS_PASSWORD || undefined,
    db: Number(process.env.QUEUE_REDIS_DB ?? 1),
    lazyConnect: true,
    protocol: 2,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  })
  const storage = new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
  })
  let child
  let worker
  let step = 'native-password'
  try {
    const password = randomBytes(24).toString('hex')
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    })
    assert.equal(await argon2.verify(hash, password), true)
    report.checks.argon2Native = 'passed'
    step = 'worker-thread'
    worker = new Worker(path.resolve('dist/sha256.worker.cjs'))
    let reply = once(worker, 'message')
    worker.postMessage({ type: 'update', chunk: Buffer.from('abc') })
    assert.equal((await reply)[0].type, 'updated')
    reply = once(worker, 'message')
    worker.postMessage({ type: 'digest' })
    assert.equal(
      (await reply)[0].sha256,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    report.checks.builtSha256Worker = 'passed'
    step = 'postgres-read-only'
    await db.connect()
    assert.equal((await db.query('SELECT 1 AS ok')).rows[0].ok, 1)
    report.checks.postgresReadOnly = 'passed'
    step = 'redis-read-only'
    await redis.connect()
    assert.equal(await redis.ping(), 'PONG')
    report.checks.sessionRedisPing = 'passed'
    await queueRedis.connect()
    assert.equal(await queueRedis.ping(), 'PONG')
    report.checks.queueRedisPing = 'passed'
    step = 'object-storage-read-only'
    await storage.send(new HeadBucketCommand({ Bucket: process.env.STORAGE_BUCKET }))
    report.checks.storageHeadBucket = 'passed'
    step = 'nest-startup'
    child = spawn(process.execPath, ['dist/main.js'], { stdio: ['ignore', 'pipe', 'pipe'] })
    // 应用日志只在内存中丢弃；不把现有配置、凭据或业务数据写入正式证据。
    child.stdout.resume()
    child.stderr.resume()
    let document
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error('Nest startup exited')
      try {
        const response = await fetch('http://127.0.0.1:3000/api-docs-json', {
          signal: AbortSignal.timeout(500),
        })
        if (response.ok) {
          document = await response.json()
          break
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    assert.ok(document?.paths, 'Nest did not expose OpenAPI')
    report.checks.nestLinuxStartup = 'passed'
    report.openapiPathCount = Object.keys(document.paths).length
    report.queueConsumerEnabled = false
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.failedStep = step
    report.errorType = error.name
    process.exitCode = 1
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit')
      child.kill('SIGTERM')
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))])
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    if (worker) await worker.terminate()
    await db.end().catch(() => {})
    // 只清理由本次随机前缀创建的队列元数据，不消费、修改已有业务队列。
    if (queueRedis.status === 'ready') {
      const prefix = process.env.QUEUE_PREFIX
      assert.match(prefix, /^codex:cloudflare:[a-f0-9]{24}$/)
      let cursor = '0'
      do {
        const scanned = await queueRedis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 100)
        cursor = scanned[0]
        const keys = scanned[1].filter((key) => key.startsWith(`${prefix}:`))
        if (keys.length) await queueRedis.del(...keys)
      } while (cursor !== '0')
      report.ownQueueMetadataCleaned = true
    }
    redis.disconnect()
    queueRedis.disconnect()
    storage.destroy()
  }
  fs.writeFileSync('result.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}

if (process.argv[2] === 'prepare') prepare()
else
  probe().catch((error) => {
    console.error(error.name)
    process.exitCode = 1
  })
