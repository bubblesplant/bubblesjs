import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureResponse } from './fixtures.mjs'

// 运行：node .spaces/04.界面与主题/万物梦幻/工具/visual-check.mjs --base-url http://127.0.0.1:9999
// 仅检查浏览器可启动：node .spaces/04.界面与主题/万物梦幻/工具/visual-check.mjs --check-launch
const require = createRequire(import.meta.url)
const bundled =
  'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || bundled)
const args = process.argv.slice(2)
const baseUrl = args.includes('--base-url')
  ? args[args.indexOf('--base-url') + 1]
  : 'http://127.0.0.1:9999'
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const uiOutput = resolve(featureRoot, 'ui')
const reportOutput = resolve(featureRoot, '测试证据')
const browserPaths = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  chromium.executablePath(),
  'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',
  'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe',
].filter(Boolean)
const executablePath = browserPaths.find(existsSync)
assert(executablePath, '未找到 Chromium，请通过 PLAYWRIGHT_EXECUTABLE_PATH 指定已安装浏览器。')
const browser = await chromium.launch({ executablePath, headless: true })
if (args.includes('--check-launch')) {
  console.log(JSON.stringify({ executablePath, version: browser.version(), baseUrl }, null, 2))
  await browser.close()
  process.exit(0)
}

const report = { baseUrl, browser: browser.version(), mockData: true, checks: [], failures: [] }
await mkdir(uiOutput, { recursive: true })
await mkdir(reportOutput, { recursive: true })
const selected = (name) => !only || name === only || name.startsWith(`${only}-`)
if (only && existsSync(resolve(reportOutput, 'visual-report.json'))) {
  const previous = JSON.parse(
    await readFile(resolve(reportOutput, 'visual-report.json'), 'utf8'),
  )
  if (previous.baseUrl === baseUrl) {
    report.checks = previous.checks.filter(({ name }) => !selected(name))
    report.failures = previous.failures.filter(({ name }) => !selected(name))
  }
}

async function scenario({ name, viewport, data = 'filled', check }) {
  if (!selected(name)) return
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  await context.addCookies([{ name: 'token', value: 'qa-only-noncredential', url: baseUrl }])
  const unexpected = []
  const pageErrors = []
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (request.method() !== 'GET') {
      unexpected.push(`禁止真实写入：${request.method()} ${url.pathname}`)
      return route.fulfill({ status: 405, json: { message: '视觉验证不提交写入请求。' } })
    }
    const body = fixtureResponse(url, data)
    if (body === undefined) {
      unexpected.push(`未配置 fixture：${url.pathname}`)
      return route.fulfill({ status: 501, json: { message: '视觉验证 fixture 未配置。' } })
    }
    return route.fulfill({ status: 200, json: body })
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await check(page)
    assert.deepEqual(unexpected, [], '存在未 mock 的 API 请求')
    assert.deepEqual(pageErrors, [], '存在未处理的页面错误')
    report.checks.push({ name, viewport, passed: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    const failure = { name, viewport, error: error.message, unexpected, pageErrors }
    report.failures.push(failure)
    console.error(`FAIL ${name}: ${error.message}`)
    await page.screenshot({ path: resolve(uiOutput, `${name}-failure.png`), fullPage: true })
  } finally {
    await context.close()
  }
}

async function settle(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  await page.locator('.workspace-brand:visible').first().waitFor({ state: 'visible' })
  assert.match(await page.locator('.workspace-brand:visible').first().innerText(), /万物/)
  assert.equal(await page.locator('.scope-strip').count(), 0, '原作用域横条应移除')
  await page.evaluate(() => document.fonts.ready)
}

async function noPageOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  assert(
    dimensions.document <= dimensions.viewport + 1,
    `文档横向溢出：${JSON.stringify(dimensions)}`,
  )
  assert(dimensions.body <= dimensions.viewport + 1, `页面横向溢出：${JSON.stringify(dimensions)}`)
}

async function visibleWorkspace(page, text) {
  const matches = page.locator('.workspace-context strong').filter({ hasText: text })
  await matches.first().waitFor({ state: 'visible' })
  const visible = await matches.evaluateAll((elements) =>
    elements.some((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.left < innerWidth &&
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      )
    }),
  )
  assert(visible, `当前工作空间“${text}”应在视口内可见`)
}

async function capture(page, name) {
  await noPageOverflow(page)
  await page.screenshot({
    path: resolve(uiOutput, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
  })
}

try {
  await scenario({
    name: 'companies-desktop-empty',
    viewport: { width: 1440, height: 960 },
    data: 'empty',
    check: async (page) => {
      await settle(page, '/platform/companies')
      await page.locator('.workspace-table-empty').waitFor()
      await visibleWorkspace(page, '平台管理')
      await capture(page, 'companies-desktop-empty')
    },
  })
  await scenario({
    name: 'companies-desktop-data',
    viewport: { width: 1440, height: 960 },
    check: async (page) => {
      await settle(page, '/platform/companies')
      await page.getByText('星屿科技', { exact: true }).waitFor()
      assert.equal(await page.locator('tr.ant-table-row').count(), 3)
      await capture(page, 'companies-desktop-data')
      await page.getByPlaceholder('搜索企业名称或编码').fill('云间')
      await page.getByRole('button', { name: /查\s*询/ }).click()
      await page.waitForFunction(() => document.querySelectorAll('tr.ant-table-row').length === 1)
      await page.getByRole('button', { name: /重\s*置/ }).click()
      await page.waitForFunction(() => document.querySelectorAll('tr.ant-table-row').length === 3)
      await page.getByRole('button', { name: '开通企业' }).click()
      await page.getByRole('dialog').waitFor()
      await capture(page, 'company-create-dialog')
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /取\s*消/ })
        .click()
    },
  })
  for (const width of [390, 360, 320]) {
    await scenario({
      name: `companies-mobile-${width}`,
      viewport: { width, height: 844 },
      check: async (page) => {
        await settle(page, '/platform/companies')
        await page.getByText('星屿科技', { exact: true }).waitFor()
        await visibleWorkspace(page, '平台管理')
        await page.locator('.workspace-switch .anticon').waitFor({ state: 'visible' })
        await page.locator('.workspace-logout .anticon').waitFor({ state: 'visible' })
        await capture(page, `companies-mobile-${width}`)
        const menu = page
          .locator('.ant-pro-global-header-collapsed-button, .ant-pro-layout-collapsed-button')
          .first()
        await menu.click()
        const accountLink = page.locator('a[href="/platform/accounts"]:visible')
        await accountLink.click()
        await page.waitForURL('**/platform/accounts')
        await page.locator('td').filter({ hasText: 'qa.visual@example.invalid' }).waitFor()
        await capture(page, `accounts-mobile-${width}`)
      },
    })
  }
  for (const width of [1440, 390]) {
    await scenario({
      name: `workspaces-${width}`,
      viewport: { width, height: 960 },
      check: async (page) => {
        await settle(page, '/workspaces')
        await page.locator('.workspace-card').first().waitFor()
        assert.equal(await page.locator('.workspace-card').count(), 3)
        await capture(page, `workspaces-${width}`)
        await page.getByLabel('搜索工作空间').fill('月光')
        assert.equal(await page.locator('.workspace-card').count(), 1)
        await page.locator('.workspace-card').getByRole('link').click()
        await page.waitForURL('**/companies/qa-company/projects/qa-project')
        await page.getByRole('heading', { name: '项目工作台' }).waitFor({ state: 'visible' })
        await visibleWorkspace(page, '月光计划')
        await capture(page, `project-home-${width}`)
        await settle(page, '/companies/qa-company/projects')
        await visibleWorkspace(page, '星屿科技')
        await page.getByText('月光计划', { exact: true }).waitFor()
        await capture(page, `company-projects-${width}`)
      },
    })
  }
  await scenario({
    name: 'workspaces-empty',
    viewport: { width: 390, height: 844 },
    data: 'empty-workspaces',
    check: async (page) => {
      await settle(page, '/workspaces')
      await page.getByText('暂未加入企业，请联系管理员添加', { exact: true }).waitFor()
      await capture(page, 'workspaces-empty')
    },
  })
  for (const width of [1440, 390]) {
    for (const authPage of ['login', 'register']) {
      await scenario({
        name: `${authPage}-${width}`,
        viewport: { width, height: 960 },
        check: async (page) => {
          await page.goto(`${baseUrl}/${authPage}`, { waitUntil: 'networkidle' })
          await page.locator('.login-brand').waitFor({ state: 'visible' })
          assert.match(await page.locator('.login-brand').innerText(), /万物/)
          const fields =
            authPage === 'login' ? ['账号', '密码'] : ['姓名', '账号', '密码', '确认密码']
          for (const label of fields) {
            const field = page.getByLabel(label, { exact: true })
            await field.waitFor({ state: 'visible' })
            await field.scrollIntoViewIfNeeded()
            const rect = await field.boundingBox()
            assert(
              rect && rect.width > 100 && rect.x >= 0 && rect.x + rect.width <= width + 1,
              `字段“${label}”应完整显示`,
            )
          }
          await page.evaluate(() => scrollTo(0, 0))
          await capture(page, `${authPage}-${width}`)
        },
      })
    }
  }
} finally {
  await writeFile(
    resolve(reportOutput, 'visual-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
console.log(
  `完成：${report.checks.length} 通过，${report.failures.length} 失败；截图：${uiOutput}；报告：${reportOutput}`,
)
process.exitCode = report.failures.length ? 1 : 0
