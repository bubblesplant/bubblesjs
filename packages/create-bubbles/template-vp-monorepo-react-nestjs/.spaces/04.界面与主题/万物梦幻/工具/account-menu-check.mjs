import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureResponse, user } from './fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const baseUrl = process.argv[2] || 'http://127.0.0.1:9999'
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const uiOutput = resolve(featureRoot, 'ui')
const reportOutput = resolve(featureRoot, '测试证据')
const executablePath = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  chromium.executablePath(),
  'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',
].find((path) => path && existsSync(path))
assert(executablePath, '未找到可用于验证的 Chromium')
const browser = await chromium.launch({ executablePath, headless: true })
const report = { baseUrl, mockData: true, checks: [], failures: [] }
await mkdir(uiOutput, { recursive: true })
await mkdir(reportOutput, { recursive: true })

/** 检查页面及账户浮层在当前视口内，防止裁切与横向溢出。 */
async function checkBounds(page) {
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    '页面横向溢出',
  )
  const viewport = page.viewportSize()
  await page.waitForFunction(() =>
    ['.workspace-landing-actions', '.workspace-account-panel'].every((selector) => {
      const element = document.querySelector(selector)
      if (!element) return false
      const box = element.getBoundingClientRect()
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.right <= innerWidth + 1 &&
        box.bottom <= innerHeight + 1 &&
        getComputedStyle(element).opacity === '1'
      )
    }),
  )
  for (const selector of ['.workspace-landing-actions', '.workspace-account-panel']) {
    const box = await page.locator(selector).boundingBox()
    assert(
      box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1,
      `${selector} 超出视口`,
    )
  }
}

/** 验证账户入口真实交互，全部 API 使用虚构响应，不访问业务服务。 */
async function scenario({
  name,
  width,
  empty = false,
  longName = false,
  english = false,
  reducedMotion = 'reduce',
}) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion,
  })
  const identity = longName
    ? {
        ...user,
        name: '测试用户拥有很长的展示姓名用于验证账户菜单',
        account: 'qa_account_with_a_long_identifier',
      }
    : user
  const unexpected = []
  const pageErrors = []
  let logoutRequests = 0
  await context.addCookies([{ name: 'token', value: 'qa-only-noncredential', url: baseUrl }])
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname === '/api/auth/logout' && request.method() === 'POST') {
      logoutRequests += 1
      return route.fulfill({ status: 200, json: { loggedOut: true } })
    }
    const body = fixtureResponse(url, empty ? 'empty-workspaces' : 'filled')
    if (request.method() !== 'GET' || body === undefined) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.fulfill({ status: 501, json: { message: '验证中未配置的 API' } })
    }
    return route.fulfill({
      status: 200,
      json: url.pathname === '/api/workspaces' ? { ...body, user: identity } : body,
    })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto(`${baseUrl}/workspaces`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: '选择工作空间' }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    if (empty) await page.getByText('暂未加入企业，请联系管理员获取邀请链接').waitFor()
    if (english) {
      await page.getByRole('button', { name: '切换语言' }).click()
      await page.getByRole('menuitem', { name: 'English' }).click()
      await page.getByRole('heading', { name: 'Choose a Workspace' }).waitFor()
      assert.equal(await page.locator('html').getAttribute('lang'), 'en')
    }
    const trigger = page.getByRole('button', { name: english ? 'Account menu' : '账户菜单' })
    const passwordLabel = english ? 'Change Password' : '修改密码'
    const logoutLabel = english ? 'Sign Out' : '退出登录'
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(await page.locator('.workspace-account-panel').count(), 0)
    await trigger.click()
    await page.getByRole('menuitem', { name: passwordLabel }).waitFor()
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
    assert(await trigger.locator('.ant-avatar').isVisible(), '账户头像不可见')
    assert(await trigger.locator('.workspace-account-chevron').isVisible(), '账户箭头不可见')
    assert.equal(await page.locator('.workspace-account-details strong').innerText(), identity.name)
    assert.equal(
      await page.locator('.workspace-account-details > span').innerText(),
      identity.account,
    )
    await checkBounds(page)
    await page.screenshot({
      path: resolve(uiOutput, `${name}.png`),
      fullPage: true,
      animations: 'disabled',
    })
    if (name === 'account-menu-desktop') {
      await page.screenshot({
        path: resolve(uiOutput, 'account-menu-detail.png'),
        clip: { x: width - 460, y: 12, width: 430, height: 280 },
        animations: 'disabled',
      })
    }

    await page.keyboard.press('Escape')
    await page.locator('.workspace-account-panel').waitFor({ state: 'hidden' })
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
    assert(
      await trigger.evaluate((element) => element === document.activeElement),
      'Esc 未还原焦点',
    )
    await trigger.press('Enter')
    await page.getByRole('menuitem', { name: passwordLabel }).waitFor()
    await page.locator('.workspace-landing').click({ position: { x: 8, y: 400 } })
    await page.locator('.workspace-account-panel').waitFor({ state: 'hidden' })
    await trigger.press('Space')
    await page.getByRole('menuitem', { name: passwordLabel }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
    assert.deepEqual(
      await dialog
        .locator('input[type="password"]')
        .evaluateAll((inputs) => inputs.map((input) => input.value)),
      ['', '', ''],
    )
    await dialog.getByRole('button', { name: english ? 'Cancel' : /取\s*消/ }).click()
    await dialog.waitFor({ state: 'hidden' })

    await trigger.click()
    await page.getByRole('menuitem', { name: logoutLabel }).click()
    await page.waitForURL('**/login')
    assert.equal(logoutRequests, 1)
    assert.equal(
      (await context.cookies()).some(({ name: cookieName }) => cookieName === 'token'),
      false,
    )
    assert.deepEqual(unexpected, [])
    assert.deepEqual(pageErrors, [])
    report.checks.push({ name, width, empty, longName, english, reducedMotion, passed: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    report.failures.push({ name, error: error.message, unexpected, pageErrors })
    await page.screenshot({ path: resolve(uiOutput, `${name}-failure.png`), fullPage: true })
    console.error(`FAIL ${name}: ${error.message}; ${JSON.stringify({ unexpected, pageErrors })}`)
    throw error
  } finally {
    await context.close()
  }
}

try {
  await scenario({ name: 'account-menu-desktop', width: 1440, reducedMotion: 'no-preference' })
  await scenario({ name: 'account-menu-reduced-motion', width: 1440 })
  await scenario({ name: 'account-menu-mobile', width: 390 })
  await scenario({ name: 'account-menu-narrow', width: 320 })
  await scenario({ name: 'account-menu-long-name', width: 320, longName: true })
  await scenario({ name: 'account-menu-empty', width: 390, empty: true })
  await scenario({ name: 'account-menu-english', width: 390, english: true })
} finally {
  await writeFile(
    resolve(reportOutput, 'account-menu.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
console.log(`完成：${report.checks.length} 通过，${report.failures.length} 失败`)
process.exitCode = report.failures.length ? 1 : 0
