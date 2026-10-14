import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const cliRoot = path.dirname(root)
const requireCli = createRequire(path.join(cliRoot, 'package.json'))
const reportPath = path.resolve(root, '.spaces/01.企业级项目级/组织架构/测试证据/p0-cli-smoke.json')
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-p0-smoke-'))

/** 仅复制可交付源码与配置，排除环境秘密、归档、索引、依赖和构建输出。 */
function includeSource(relativePath) {
  return !relativePath
    .split('/')
    .some(
      (segment) =>
        [
          '.spaces',
          '.codegraph',
          '.git',
          'node_modules',
          'dist',
          'coverage',
          '.vite',
          '.turbo',
        ].includes(segment) ||
        segment.startsWith('.env') ||
        segment.endsWith('.tsbuildinfo') ||
        segment.endsWith('.tgz'),
    )
}

try {
  const staging = path.join(temporaryRoot, 'cli')
  const template = path.join(staging, path.basename(root))
  fs.mkdirSync(path.join(staging, 'dist'), { recursive: true })
  fs.copyFileSync(path.join(cliRoot, 'package.json'), path.join(staging, 'package.json'))
  // 只调整 staging 中的依赖解析位置，CLI 编译逻辑与模板复制逻辑保持原样。
  const compiledCli = fs
    .readFileSync(path.join(cliRoot, 'dist/index.js'), 'utf8')
    .replace(
      /from"(@clack\/prompts|cross-spawn|gradient-string|mri)"/g,
      (_match, dependency) => `from"${pathToFileURL(requireCli.resolve(dependency)).href}"`,
    )
  fs.writeFileSync(path.join(staging, 'dist/index.js'), compiledCli)
  const listedFiles = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
  const copiedFiles = []
  for (const relativePath of new Set(listedFiles)) {
    const source = path.resolve(root, relativePath)
    if (!includeSource(relativePath) || !fs.existsSync(source) || !fs.statSync(source).isFile())
      continue
    const destination = path.join(template, relativePath)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    copiedFiles.push(relativePath)
  }
  execFileSync(
    process.execPath,
    [path.join(staging, 'dist/index.js'), 'p0-generated-project', '-t', 'vp-monorepo-react-nestjs'],
    { cwd: temporaryRoot, stdio: 'pipe', timeout: 30000 },
  )
  const generated = path.join(temporaryRoot, 'p0-generated-project')
  const readJson = (relativePath) =>
    JSON.parse(fs.readFileSync(path.join(generated, relativePath), 'utf8'))
  assert.equal(readJson('package.json').name, 'p0-generated-project')
  assert.deepEqual(
    readJson('apps/server/drizzle/meta/_journal.json').entries.map((item) => item.idx),
    [0, 1, 2, 3, 5, 6],
  )
  for (const retired of [
    'apps/server/drizzle/0004_company-member-invitations.sql',
    'apps/server/src/modules/members/invitations',
    'apps/web/src/pages/member-invitations',
    'apps/web/src/pages/access/components/CompanyHierarchyDialog.tsx',
  ]) {
    assert.equal(fs.existsSync(path.join(generated, retired)), false, retired)
  }
  assert.ok(
    fs.existsSync(path.join(generated, 'apps/server/drizzle/0006_independent_companies.sql')),
  )
  const report = {
    passed: true,
    template: 'vp-monorepo-react-nestjs',
    cleanStaging: true,
    excluded: [
      'environment files',
      'dependencies',
      'build outputs',
      'spaces archives',
      'code index',
    ],
    copiedFiles: copiedFiles.length,
    checks: [
      'generated package name',
      'migration journal',
      'forward migration present',
      'retired invitation absent',
      'retired company hierarchy absent',
    ],
    limitations: '干净 staging 的真实 CLI 复制验证；不代表发布包全量内容审计或新项目安装构建。',
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  const resolved = path.resolve(temporaryRoot)
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
  assert.ok(path.basename(resolved).startsWith('bubbles-p0-smoke-'))
  fs.rmSync(resolved, { recursive: true, force: true })
}
