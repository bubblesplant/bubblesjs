import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEnvironment } from './environment.mjs'
import { runBrowserChecks } from './checks.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = resolve(featureRoot, '../../..')
const report = {
  executedAt: new Date().toISOString(),
  mockHttp: false,
  checks: [],
  failures: [],
  images: [],
}
const environment = createEnvironment({ repoRoot, report })
let browser
await mkdir(resolve(featureRoot, 'ui'), { recursive: true })
await mkdir(resolve(featureRoot, '测试证据'), { recursive: true })

try {
  await environment.start()
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  report.browserVersion = browser.version()
  await runBrowserChecks({ browser, environment, featureRoot, report })
} catch (error) {
  report.failures.push({ name: error.name, message: environment.redact(error.message) })
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  const cleanupErrors = await environment.dispose()
  if (cleanupErrors.length) process.exitCode = 1
  report.completedAt = new Date().toISOString()
  await writeFile(resolve(featureRoot, '测试证据/e2e.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
