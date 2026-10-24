const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const repositoryRoot = path.resolve(__dirname, '../../../../..')
const serverRoot = path.join(repositoryRoot, 'apps/server')
const featureRoot = path.resolve(__dirname, '../..')
const evidencePath = path.join(
  featureRoot,
  '测试证据/administrator-visibility/database-readonly-verification.json',
)
const serverRequire = createRequire(path.join(serverRoot, 'package.json'))
let verificationPhase = 'prepare'

/** 仅将聚合验证结论保存为证据，禁止保存数据库原始行和连接配置。 */
function saveEvidence(summary) {
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  fs.writeFileSync(evidencePath, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
}

/** 统一公开字段及排序以比较完整管理员内容，原始身份信息只停留在进程内存中。 */
function normalizeAdministrators(administrators) {
  return administrators
    .map((administrator) => ({
      id: administrator.id,
      name: administrator.name,
      account: administrator.account,
      accountStatus: administrator.accountStatus,
      memberStatus: administrator.memberStatus,
      effective: administrator.effective,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

/** 只提取固定格式的错误码，防止原始异常携带 SQL 参数、连接信息或真实业务数据。 */
function safeErrorCode(error) {
  let current = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(current.code))
      return current.code
    current = current.cause
  }
  return 'READONLY_VERIFICATION_FAILED'
}

/**
 * 使用当前 Server 的环境文件优先级与连接配置，在数据库强制只读事务中比较真实服务查询。
 * 不创建 Nest 容器，不执行生命周期、初始化、迁移、seed、认证或业务写操作。
 */
async function verifyAdministratorQueries() {
  process.chdir(serverRoot)
  verificationPhase = 'register-typescript-runtime'
  serverRequire('reflect-metadata')
  serverRequire('ts-node').register({
    project: path.join(serverRoot, 'tsconfig.scripts.json'),
    transpileOnly: true,
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
  })
  serverRequire('tsconfig-paths').register({
    baseUrl: serverRoot,
    paths: { '@/*': ['./src/*'] },
  })

  verificationPhase = 'load-server-database-configuration'
  const { ENV_ARR } = serverRequire(path.join(serverRoot, 'src/utils/env-arr.ts'))
  serverRequire('dotenv').config({ path: ENV_ARR, quiet: true })
  const databaseConfig = serverRequire(
    path.join(serverRoot, 'src/config/database.config.ts'),
  ).default()
  const { Pool } = serverRequire('pg')
  const { drizzle } = serverRequire('drizzle-orm/node-postgres')
  const { sql } = serverRequire('drizzle-orm')
  verificationPhase = 'load-existing-query-services'
  const schema = serverRequire(path.join(serverRoot, 'src/database/schema'))
  const { AccessService } = serverRequire(
    path.join(serverRoot, 'src/modules/access/access.service.ts'),
  )
  const { MembersService } = serverRequire(
    path.join(serverRoot, 'src/modules/members/members.service.ts'),
  )
  const { AdministratorsService } = serverRequire(
    path.join(serverRoot, 'src/modules/members/administrators/administrators.service.ts'),
  )
  const pool = new Pool({
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.database,
    user: databaseConfig.username,
    password: databaseConfig.password,
    max: 1,
    connectionTimeoutMillis: 5_000,
    query_timeout: 20_000,
    options: '-c default_transaction_read_only=on -c statement_timeout=15000',
    application_name: 'administrator-visibility-readonly-verification',
  })

  try {
    const db = drizzle(pool, { schema })
    const access = new AccessService(db)
    // 只读方法仅使用真实 AccessService 和成员表选择逻辑，不创建 seed 或密码服务。
    const members = new MembersService(access, undefined, undefined)
    const administrators = new AdministratorsService(access, members, undefined)
    verificationPhase = 'compare-in-readonly-transaction'
    return await db.transaction(
      /** 在同一快照中执行批量与逐企查询，仅返回汇总数字及一致性结论。 */
      async (tx) => {
        const readOnlyResult = await tx.execute(sql`show transaction_read_only`)
        const isolationResult = await tx.execute(sql`show transaction_isolation`)
        const transactionReadOnly = readOnlyResult.rows[0]?.transaction_read_only === 'on'
        const transactionIsolation = isolationResult.rows[0]?.transaction_isolation
        if (!transactionReadOnly || transactionIsolation !== 'repeatable read')
          throw new Error('Required read-only repeatable-read transaction is unavailable')

        const companies = await tx.select({ id: schema.companies.id }).from(schema.companies)
        const companyIds = companies.map((company) => company.id)
        const batch = await administrators.companyAdministrators(tx, companyIds)
        let inconsistentCompanyCount = 0
        let companyCountWithAdministrators = 0
        let administratorAssignmentCount = 0
        let effectiveAdministratorAssignmentCount = 0
        const uniqueAdministrators = new Set()
        const uniqueEffectiveAdministrators = new Set()

        for (const company of companies) {
          const batchAdministrators = batch.get(company.id) ?? []
          const detailAdministrators = await administrators.administrators(tx, {
            type: 'company',
            companyId: company.id,
          })
          if (
            JSON.stringify(normalizeAdministrators(batchAdministrators)) !==
            JSON.stringify(normalizeAdministrators(detailAdministrators))
          )
            inconsistentCompanyCount += 1
          if (batchAdministrators.length) companyCountWithAdministrators += 1
          administratorAssignmentCount += batchAdministrators.length
          for (const administrator of batchAdministrators) {
            uniqueAdministrators.add(administrator.id)
            if (administrator.effective) {
              effectiveAdministratorAssignmentCount += 1
              uniqueEffectiveAdministrators.add(administrator.id)
            }
          }
        }

        return {
          verifiedAt: new Date().toISOString(),
          status: inconsistentCompanyCount === 0 ? 'PASS' : 'FAIL',
          scope: 'current-server-configured-database',
          transactionReadOnly,
          transactionIsolation,
          companyCount: companies.length,
          companyCountWithAdministrators,
          companyCountWithoutAdministrators: companies.length - companyCountWithAdministrators,
          administratorAssignmentCount,
          effectiveAdministratorAssignmentCount,
          uniqueAdministratorCount: uniqueAdministrators.size,
          uniqueEffectiveAdministratorCount: uniqueEffectiveAdministrators.size,
          comparedCompanyCount: companies.length,
          inconsistentCompanyCount,
          batchAndDetailConsistent: inconsistentCompanyCount === 0,
          nestInitialized: false,
          seedExecuted: false,
          businessWriteOperations: 0,
          personalDataSaved: false,
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  } finally {
    await pool.end()
  }
}

/** 保存脱敏验证结果；异常时仅输出安全错误码，不泄漏原始异常。 */
async function main() {
  try {
    const summary = await verifyAdministratorQueries()
    saveEvidence(summary)
    if (summary.status !== 'PASS') process.exitCode = 1
  } catch (error) {
    saveEvidence({
      verifiedAt: new Date().toISOString(),
      status: 'ERROR',
      code: safeErrorCode(error),
      phase: verificationPhase,
      typescriptDiagnosticCodes: Array.isArray(error?.diagnosticCodes)
        ? error.diagnosticCodes.filter(Number.isInteger)
        : [],
      message: '只读管理员查询核验未完成，原始异常内容已抑制。',
      personalDataSaved: false,
    })
    process.exitCode = 1
  }
}

void main()
