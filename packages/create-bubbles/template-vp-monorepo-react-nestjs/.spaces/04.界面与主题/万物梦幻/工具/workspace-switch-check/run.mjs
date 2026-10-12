import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installFixtures, workspaceEntries, withLongNames } from './fixtures.mjs'
import { checkPageBounds, checkSharedHeader } from './helpers.mjs'
import {
  checkFilters,
  checkRefreshFailure,
  checkNavigation,
  checkEmpty,
  checkMissingCompanyNames,
} from './checks.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const baseUrl = process.argv[2] || 'http://127.0.0.1:9999'
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const uiRoot = resolve(featureRoot, 'ui')
const reportPath = resolve(featureRoot, '测试证据/workspace-switch.json')
const selectedNames = process.argv[3]?.split(',').filter(Boolean)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
let report = {
  baseUrl,
  mockData: true,
  browserVersion: browser.version(),
  executedAt: new Date().toISOString(),
  checks: [],
  failures: [],
  images: [],
}
if (selectedNames) {
  const previous = JSON.parse(await readFile(reportPath, 'utf8'))
  report = {
    ...previous,
    browserVersion: browser.version(),
    executedAt: report.executedAt,
    checks: previous.checks
      .filter((check) => !selectedNames.includes(check.name))
      .map((check) => ({ executedAt: previous.executedAt, ...check })),
    failures: previous.failures.filter((failure) => !selectedNames.includes(failure.name)),
    images: previous.images.filter(
      (item) => !selectedNames.some((name) => item.name === `workspace-switch-${name}-failure`),
    ),
    retests: [
      ...(previous.retests || []),
      {
        executedAt: report.executedAt,
        scenarios: selectedNames,
        priorFailures: previous.failures.filter((failure) => selectedNames.includes(failure.name)),
      },
    ],
  }
}
await mkdir(uiRoot, { recursive: true })
await mkdir(dirname(reportPath), { recursive: true })

/** 在独立登录和语言上下文中验证真实开发页面，归档截图及异常证据。 */
async function scenario(options, check) {
  if (selectedNames && !selectedNames.includes(options.name)) return
  const {
    name,
    width = 1440,
    locale = 'zh_CN',
    path = '/workspaces',
    longNames = false,
    empty = false,
    missingCompanyNames = false,
    reducedMotion = 'no-preference',
  } = options
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion,
    deviceScaleFactor: 1,
  })
  const entries = empty
    ? []
    : longNames
      ? withLongNames(workspaceEntries)
      : missingCompanyNames
        ? workspaceEntries.map((entry) => {
            if (entry.scope.type !== 'project' || entry.scope.companyId !== 'qa-company')
              return entry
            const { companyName: _companyName, ...withoutName } = entry
            return withoutName
          })
        : workspaceEntries
  const state = await installFixtures({ context, baseUrl, entries, locale })
  state.baseUrl = baseUrl
  const page = await context.newPage()
  const pageErrors = []
  page.setDefaultTimeout(12000)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  /** 保存当前真实组件截图，不把示例图当业务验收。 */
  async function capture(label) {
    const path = resolve(uiRoot, `${label}.png`)
    const buffer = await page.screenshot({
      path,
      fullPage: true,
      animations: 'disabled',
    })
    report.images = report.images.filter((item) => item.name !== label)
    report.images.push({
      name: label,
      path,
      bytes: buffer.length,
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      language: await page.evaluate(() => document.documentElement.lang),
    })
  }
  try {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
    await page.locator('.locale-switch-trigger').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(450)
    const geometry = await checkPageBounds(page)
    const details = await check({ context, page, state, capture, ...options })
    assert.deepEqual(state.unexpected, [], '存在未配置API')
    assert.deepEqual(pageErrors, [], '页面存在运行时异常')
    report.checks.push({
      name,
      width,
      locale,
      longNames,
      reducedMotion,
      geometry,
      details,
      passed: true,
      executedAt: new Date().toISOString(),
    })
    console.log(`PASS ${name}`)
  } catch (error) {
    report.failures.push({ name, error: error.message, unexpected: state.unexpected, pageErrors })
    await capture(`workspace-switch-${name}-failure`)
    console.error(`FAIL ${name}: ${error.message}`)
  } finally {
    await context.close()
  }
}

/** 检查窄屏、长名、英文与减弱动画下的卡片布局及共享头部。 */
async function checkPresentation({ context, page, state, capture, name, locale }) {
  await capture(`workspace-switch-${name}`)
  assert.equal(await page.locator('.workspace-card').count(), 6)
  const header = await checkSharedHeader({
    context,
    page,
    state,
    english: locale === 'en_US',
    actions: name === 'english',
  })
  return { sixCards: true, header }
}

try {
  await scenario({ name: 'filters-desktop' }, checkFilters)
  await scenario({ name: 'refresh-failure' }, checkRefreshFailure)
  await scenario(
    { name: 'missing-company-name', missingCompanyNames: true },
    checkMissingCompanyNames,
  )
  await scenario({ name: 'mobile', width: 390 }, checkPresentation)
  await scenario({ name: 'narrow-long', width: 320, longNames: true }, checkPresentation)
  await scenario({ name: 'english', locale: 'en_US' }, checkPresentation)
  await scenario({ name: 'reduced-motion', reducedMotion: 'reduce' }, checkPresentation)
  await scenario({ name: 'empty', width: 390, empty: true }, checkEmpty)
  for (const [scopeType, path] of Object.entries({
    platform: '/platform',
    company: '/companies/qa-company',
    project: '/companies/qa-company/projects/qa-project',
  })) {
    await scenario({ name: `navigation-${scopeType}`, path, scopeType }, checkNavigation)
  }
  await scenario(
    {
      name: 'navigation-company-narrow',
      path: '/companies/qa-company',
      scopeType: 'company',
      width: 320,
    },
    checkNavigation,
  )
} finally {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  await browser.close()
}
console.log(`完成：${report.checks.length} 通过，${report.failures.length} 失败；${reportPath}`)
process.exitCode = report.failures.length ? 1 : 0
