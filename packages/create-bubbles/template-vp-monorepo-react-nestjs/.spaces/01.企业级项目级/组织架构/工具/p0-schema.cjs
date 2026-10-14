const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const root = path.resolve(__dirname, '../../../..')
const requireServer = createRequire(path.join(root, 'apps/server/package.json'))

/** 读取仓库内 JSON，不加载业务环境或数据库连接配置。 */
function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

/** 枚举当前源码文件，用于静态端点和取消概念核对。 */
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const location = path.join(directory, item.name)
    return item.isDirectory() ? sourceFiles(location) : [location]
  })
}

/** 参数名不影响路由形状；核对方法、固定路径与参数位置。 */
function routeShape(route) {
  return route.replace(/:[A-Za-z][A-Za-z0-9]*/g, ':parameter')
}

/** 验证最终 Schema、历史迁移、领域统计和有效运行代码的取消范围。 */
async function main() {
  process.env.TS_NODE_PROJECT = path.join(root, 'apps/server/tsconfig.scripts.json')
  requireServer('ts-node/register/transpile-only')
  const schema = requireServer(path.join(root, 'apps/server/src/database/schema.ts'))
  const { generateDrizzleJson } = requireServer('drizzle-kit/api')
  const snapshot = readJson('apps/server/drizzle/meta/0006_snapshot.json')
  const generated = JSON.parse(JSON.stringify(generateDrizzleJson(schema, snapshot.prevId)))
  for (const key of ['tables', 'enums', 'schemas', 'sequences', 'roles', 'policies', 'views']) {
    assert.deepEqual(snapshot[key], generated[key], 'snapshot differs: ' + key)
  }
  const prefix = execFileSync('git', ['rev-parse', '--show-prefix'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  for (const file of [
    '0003_cute_killmonger.sql',
    'meta/0003_snapshot.json',
    '0005_menu_svg_icons.sql',
  ]) {
    const baseline = execFileSync(
      'git',
      ['show', 'HEAD:' + prefix + 'apps/server/drizzle/' + file],
      { cwd: root, encoding: 'utf8' },
    )
    assert.equal(
      fs
        .readFileSync(path.join(root, 'apps/server/drizzle', file), 'utf8')
        .replaceAll('\r\n', '\n'),
      baseline.replaceAll('\r\n', '\n'),
      'historical migration changed',
    )
  }
  const migrationIndices = readJson('apps/server/drizzle/meta/_journal.json').entries.map(
    (item) => item.idx,
  )
  assert.deepEqual(migrationIndices, [0, 1, 2, 3, 5, 6])
  const organizationTables = Object.entries(generated.tables).filter(([key]) =>
    /organization|position/.test(key),
  )
  const organizationFields = organizationTables.reduce(
    (total, [, table]) => total + Object.keys(table.columns).length,
    0,
  )
  assert.equal(organizationTables.length, 10)
  assert.equal(organizationFields, 97)
  assert.deepEqual(
    Object.keys(generated.tables['public.companies'].columns).sort(),
    Object.keys(
      readJson('apps/server/drizzle/meta/0002_snapshot.json').tables['public.companies'].columns,
    ).sort(),
  )
  const { ACCESS_PERMISSION_CATALOG } = await import(
    pathToFileURL(path.join(root, 'packages/shared/dist/index.js')).href
  )
  const permissionKeys = ACCESS_PERMISSION_CATALOG.filter((item) =>
    /^(company|project)\.(organization|positions)\./.test(item.key),
  ).map((item) => item.key)
  assert.equal(permissionKeys.length, 21)
  assert.equal(
    ACCESS_PERMISSION_CATALOG.some((item) => item.key === 'platform.companies.hierarchy'),
    false,
  )
  const contract = fs
    .readFileSync(path.join(root, '.spaces/01.企业级项目级/组织架构/技术契约.md'), 'utf8')
    .split('## 4. REST 端点')[1]
    .split('## 5. 权限目录与页面')[0]
  const tableRoutes = [
    ...contract.matchAll(/^\|\s*(GET|POST|PATCH|PUT|DELETE)\s+`([^`]+)`/gm),
  ].flatMap(([, method, url]) => {
    const paths = url.includes('{scopeBase}')
      ? ['/companies/:companyId', '/companies/:companyId/projects/:projectId'].map((base) =>
          url.replace('{scopeBase}', base),
        )
      : [url]
    return paths.map((url) => `${method} ${url}`)
  })
  const changedRoutes = [...contract.matchAll(/^- `(GET|POST|PATCH|PUT|DELETE) ([^`]+)`/gm)].map(
    ([, method, url]) => `${method} ${url}`,
  )
  assert.equal(tableRoutes.length, 41)
  assert.equal(changedRoutes.length, 4)
  const activeFiles = ['apps/server/src', 'apps/web/src', 'packages/shared/src']
    .flatMap((directory) => sourceFiles(path.join(root, directory)))
    .filter((file) => /\.(ts|tsx)$/.test(file))
  const implemented = new Set()
  for (const file of activeFiles.filter((file) => file.endsWith('.controller.ts'))) {
    const content = fs.readFileSync(file, 'utf8')
    const baseDeclaration = content.match(/@Controller\(([^)]*)\)/)?.[1] ?? ''
    const controllerBases = [...baseDeclaration.matchAll(/'([^']*)'/g)].map(([, base]) => base)
    if (!controllerBases.length) controllerBases.push('')
    for (const [, method, url] of content.matchAll(
      /@(Get|Post|Patch|Put|Delete)\((?:'([^']*)')?\)/g,
    )) {
      for (const base of controllerBases)
        implemented.add(
          routeShape(`${method.toUpperCase()} /${[base, url].filter(Boolean).join('/')}`),
        )
    }
  }
  for (const route of [...tableRoutes, ...changedRoutes])
    assert.ok(implemented.has(routeShape(route)), 'route absent: ' + route)
  const retiredConcept =
    /parentCompanyId|companyEntityType|CompanyHierarchy|CompanyMemberInvitation|company_member_invitations|platform\.companies\.hierarchy|member-invitations|memberInvitations/
  const remainingFiles = activeFiles
    .filter((file) => retiredConcept.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(root, file))
  assert.deepEqual(remainingFiles, [])
  const report = {
    snapshotMatchesSchema: true,
    historicalMigrationsUnchanged: true,
    migrationIndices,
    organizationTables: 10,
    organizationFields,
    companiesNewFields: 0,
    organizationPermissionCount: permissionKeys.length,
    organizationPermissionKeys: permissionKeys,
    contractTableRoutes: tableRoutes.length,
    changedExistingRoutes: changedRoutes.length,
    affectedRoutes: [...tableRoutes, ...changedRoutes],
    controllerRouteShapesMatch: true,
    retiredConceptScan: { activeSourceFiles: activeFiles.length, remainingFiles },
    limitations:
      '静态端点存在性与字段核对，不代表全部 45 端点的业务 E2E 通过。历史 0003、前向 0006、拒绝字段测试和不可执行归档不在运行源码扫描范围。',
  }
  fs.writeFileSync(
    path.join(root, '.spaces/01.企业级项目级/组织架构/测试证据/p0-schema.json'),
    JSON.stringify(report, null, 2) + '\n',
  )
  console.log(
    'Schema matches; 10 tables / 97 fields / 21 permissions / 45 routes; retired runtime concepts absent.',
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
