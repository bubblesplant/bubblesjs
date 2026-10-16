const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

/**
 * 用真实 CLI 复制当前源码视图，跳过 Git 忽略的本地依赖、配置与缓存。
 * 本次自动清理已被工具策略拒绝，保留路径与原因，不更换删除方式绕过限制。
 */
function main() {
  const source = path.resolve(__dirname, '../../../..')
  const cli = path.resolve(source, '..', 'index.js')
  const scratchBase = path.join(os.homedir(), 'Documents/Codex/scratch-tests')
  const scratch = path.join(scratchBase, `file-hash-template-${randomUUID()}`)
  assert.ok(path.resolve(scratch).startsWith(`${path.resolve(scratchBase)}${path.sep}`))
  fs.mkdirSync(scratch, { recursive: true })
  try {
    const files = execFileSync(
      'git',
      [
        '-c',
        'core.quotepath=false',
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        '.',
      ],
      { cwd: source, encoding: 'utf8' },
    )
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((file) => path.resolve(source, file))
      .filter((file) => fs.existsSync(file) && fs.lstatSync(file).isFile())
    const allowed = new Set([source])
    for (const file of files) {
      let current = file
      while (current.startsWith(`${source}${path.sep}`)) {
        allowed.add(current)
        current = path.dirname(current)
      }
    }
    const preload = path.join(scratch, 'source-view.cjs')
    fs.writeFileSync(
      preload,
      `const fs = require('node:fs')
const path = require('node:path')
const source = ${JSON.stringify(source)}
const allowed = new Set(${JSON.stringify([...allowed])})
const original = fs.readdirSync
fs.readdirSync = function(directory, ...options) {
  const entries = original.call(this, directory, ...options)
  const absolute = path.resolve(directory)
  if (absolute !== source && !absolute.startsWith(source + path.sep)) return entries
  return entries.filter(entry => allowed.has(path.join(absolute, entry)))
}
`,
    )
    const target = path.join(scratch, 'generated-app')
    execFileSync(
      process.execPath,
      ['--require', preload, cli, target, '-t', 'vp-monorepo-react-nestjs'],
      {
        cwd: scratch,
        stdio: 'pipe',
      },
    )
    const generatedPackage = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'))
    assert.equal(generatedPackage.name, 'generated-app')
    for (const relative of [
      'apps/web/src/services/file-hash/index.ts',
      'apps/web/src/services/file-hash/sha256.worker.ts',
      'packages/shared/src/utils/file-hash/calculate.ts',
      'packages/shared/package.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
    ]) {
      assert.deepEqual(
        fs.readFileSync(path.join(target, relative)),
        fs.readFileSync(path.join(source, relative)),
      )
    }
    assert.equal(fs.existsSync(path.join(target, 'node_modules')), false)
    assert.equal(fs.existsSync(path.join(target, '.env')), false)
    const evidence = {
      status: 'passed',
      template: 'vp-monorepo-react-nestjs',
      sourceView: 'Git 当前源码文件；忽略本地依赖、缓存与环境文件；真实已构建 CLI',
      copiedSourceFiles: files.length,
      generatedName: generatedPackage.name,
      cleanup: {
        status: 'blocked_by_tool_policy',
        retainedPath: scratch,
        reason: '此前临时验证目录的递归清理命令被工具策略拒绝，未尝试其他删除方式。',
      },
    }
    fs.writeFileSync(
      path.join(__dirname, '../测试证据/模板冒烟.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
    )
    console.log(JSON.stringify(evidence, null, 2))
  } finally {
    console.log(`临时源码快照保留：${scratch}（自动清理被工具策略拒绝）`)
  }
}

main()
