import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const serverRequire = createRequire(resolve(root, 'apps/server/package.json'))
export const evidenceDirectory = resolve(root, '.spaces/01.企业级项目级/权限与菜单/测试证据')
export const uiDirectory = resolve(root, '.spaces/01.企业级项目级/权限与菜单/ui')

export function ensure(condition, message) {
  if (!condition) throw new Error(message)
}

function isSystemTempPath(path) {
  const parent = realpathSync.native(dirname(resolve(path)))
  const difference = relative(realpathSync.native(tmpdir()), parent)
  return (
    difference !== '..' &&
    !difference.startsWith(`..\\`) &&
    !difference.startsWith('../') &&
    !isAbsolute(difference)
  )
}

export function loadRuntime(runtimePath) {
  ensure(runtimePath, '必须提供系统临时目录中的隔离运行配置路径')
  const resolved = resolve(runtimePath)
  ensure(isSystemTempPath(resolved), '运行配置必须位于系统临时目录')
  const runtime = JSON.parse(readFileSync(resolved, 'utf8').replace(/^\uFEFF/, ''))
  ensure(
    ['127.0.0.1', 'localhost'].includes(runtime.database?.host) &&
      /^enterprise_(test|legacy)(_[a-z0-9]+)?$/.test(runtime.database?.database ?? '') &&
      runtime.database?.port === 15432 &&
      runtime.redisPort === 16379,
    '拒绝运行：只允许指定本机隔离 PostgreSQL 与 Redis',
  )
  return { runtime, runtimePath: resolved }
}

export function databaseConfig(runtime, database = runtime.database.database) {
  const { host, port, user, password } = runtime.database
  return { host, port, user, password, database }
}

export function randomIdentity(label) {
  const suffix = randomBytes(6).toString('hex')
  return {
    account: `qa_${label}_${suffix}`.slice(0, 32),
    name: `验收${label}`,
    password: randomBytes(30).toString('base64url'),
  }
}

export function privateStatePath(runtimePath, name) {
  return resolve(dirname(runtimePath), `codex-enterprise-01a085-qa-${name}.json`)
}

export function writePrivateState(path, state) {
  ensure(isSystemTempPath(path), '敏感测试状态只能写入系统临时目录')
  writeFileSync(path, JSON.stringify(state), { mode: 0o600 })
}

export function readPrivateState(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
}

export function writeEvidence(name, evidence) {
  mkdirSync(evidenceDirectory, { recursive: true })
  const path = resolve(evidenceDirectory, `${name}.json`)
  const payload = JSON.stringify(evidence, null, 2)
  ensure(
    !/"(password|passwordHash|accessToken|sessionPepper|secretAccessKey|token)"\s*:/i.test(payload),
    '证据中不得写入凭据字段',
  )
  writeFileSync(path, `${payload}\n`)
  return path
}

export function createReporter(suite) {
  const results = []
  return {
    results,
    async check({ id, acceptance, run }) {
      try {
        const evidence = await run()
        results.push({ id, acceptance, status: 'passed', evidence: evidence ?? '断言通过' })
        process.stdout.write(`PASS ${id}\n`)
        return true
      } catch (error) {
        results.push({
          id,
          acceptance,
          status: 'failed',
          evidence: error instanceof Error ? error.message : '测试失败',
        })
        process.stdout.write(`FAIL ${id}\n`)
        return false
      }
    },
    pending({ id, acceptance, reason }) {
      results.push({ id, acceptance, status: 'unverified', evidence: reason })
    },
    save() {
      return writeEvidence(suite, { suite, executedAt: new Date().toISOString(), results })
    },
  }
}
