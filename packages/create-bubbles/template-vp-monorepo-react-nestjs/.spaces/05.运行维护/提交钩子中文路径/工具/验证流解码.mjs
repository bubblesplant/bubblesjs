import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { runInNewContext } from 'node:vm'

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    'expect-broken': { type: 'boolean', default: false },
  },
})
const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: projectRoot,
  encoding: 'utf8',
}).trim()
const bundlePath = path.join(repoRoot, 'node_modules/vite-plus/dist/staged/bin.js')
const { version: vitePlusVersion } = JSON.parse(
  await readFile(path.join(repoRoot, 'node_modules/vite-plus/package.json'), 'utf8'),
)
const source = await readFile(bundlePath, 'utf8')
const functionSource = source.match(/async function readStream\(stream\) \{[\s\S]*?\n\}/)?.[0]
assert.ok(functionSource, '必须验证实际安装的 Vite+ readStream 实现')
const readStream = runInNewContext(`(${functionSource})`)

/** 将一次 UTF-8 输出拆成跨事件循环的两段，确保读取方实际经历分块边界。 */
async function* splitOutput({ bytes, offset }) {
  yield bytes.subarray(0, offset)
  await setImmediate()
  yield bytes.subarray(offset)
}

const samples = [
  'packages/example/.spaces/权限与菜单/测试证据/selector-tests.txt\0',
  'logs/中文-é-🚀.txt\0',
]
const failures = []
let cases = 0
for (const expected of samples) {
  const bytes = Buffer.from(expected)
  for (let offset = 1; offset < bytes.length; offset++) {
    const stream = Readable.from(splitOutput({ bytes, offset }), { objectMode: false })
    const actual = await readStream(stream)
    cases++
    if (actual !== expected) failures.push({ offset, expected, actual })
  }
}

const emptyOutput = await readStream(Readable.from([], { objectMode: false }))
assert.equal(emptyOutput, '', '空输出必须保持为空字符串')
const report = {
  date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()),
  vitePlusVersion,
  bundlePath,
  expectedBroken: values['expect-broken'],
  cases: cases + 1,
  failureCount: failures.length,
  failureExamples: failures.slice(0, 3),
}
if (values.output) {
  const outputPath = path.resolve(values.output)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify(report, null, 2))
if (values['expect-broken']) assert.ok(failures.length > 0, '修复前必须实际复现字符损坏')
else assert.equal(failures.length, 0, '所有 UTF-8 分块都必须保持原始路径')
