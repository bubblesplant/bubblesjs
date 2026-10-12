import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureResponse, user } from './fixtures.mjs'
import { checkHeaderHover } from './header-hover-check.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const baseUrl = process.argv[2] || 'http://127.0.0.1:9999'
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const uiRoot = resolve(featureRoot, 'ui')
const reportRoot = resolve(featureRoot, '测试证据')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const report = {
  baseUrl,
  mockData: true,
  browserVersion: browser.version(),
  checks: [],
  failures: [],
}
await mkdir(uiRoot, { recursive: true })
await mkdir(reportRoot, { recursive: true })

/** 等待浮层过渡完成，保证几何、箭头以及焦点测量针对最终位置。 */
async function openPopover(page) {
  await page.locator('.locale-switch-trigger').click()
  const popup = page.locator('.locale-switch-popover')
  await popup.waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const target =
      document.querySelector('.locale-switch-popover input') ||
      document.querySelector('.locale-switch-popover [aria-checked="true"]') ||
      document.querySelector('.locale-switch-popover [role="menuitemradio"]')
    return target && target === document.activeElement
  })
  await page.waitForTimeout(220)
  return popup
}

/** 检查浮层和箭头都在视口内，箭头的中心与小图标入口对齐。 */
async function checkPopoverBounds(page) {
  const popup = await page.locator('.locale-switch-popover').boundingBox()
  const arrow = await page.locator('.locale-switch-popover .ant-popover-arrow').boundingBox()
  const trigger = await page.locator('.locale-switch-trigger').boundingBox()
  const { width, height } = page.viewportSize()
  assert(
    popup.x >= 0 &&
      popup.y >= 0 &&
      popup.x + popup.width <= width + 1 &&
      popup.y + popup.height <= height + 1,
    '语言浮层超出视口',
  )
  assert(arrow && arrow.width > 0 && arrow.height > 0, 'Popover 箭头缺失')
  assert(
    Math.abs(arrow.x + arrow.width / 2 - trigger.x - trigger.width / 2) < 2,
    'Popover 箭头没有指向入口中心',
  )
  assert.equal(await page.locator('.locale-switch-trigger').innerText(), '', '语言入口包含文字')
  assert.equal(trigger.width, 32)
  assert.equal(trigger.height, 32)
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    '页面横向溢出',
  )
  return { popup, arrow, trigger }
}

/** 全量 mock API，覆盖共享语言入口、账号行为和各头部的布局稳定性。 */
async function scenario({ name, path, width, locale = 'zh_CN', reducedMotion = 'no-preference' }) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    locale: 'zh-CN',
    deviceScaleFactor: 1,
    reducedMotion,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const unexpected = []
  const pageErrors = []
  let logoutRequests = 0
  await context.addCookies([{ name: 'token', value: 'qa-only-noncredential', url: baseUrl }])
  await context.addInitScript(
    (value) => localStorage.setItem('wanwu-locale', JSON.stringify(value)),
    locale,
  )
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname === '/api/auth/logout' && request.method() === 'POST') {
      logoutRequests += 1
      return route.fulfill({ status: 200, json: { loggedOut: true } })
    }
    const body = fixtureResponse(url, 'filled')
    if (request.method() !== 'GET' || body === undefined) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.fulfill({ status: 501, json: { message: '验证中未配置的 API' } })
    }
    return route.fulfill({ status: 200, json: body })
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
    await page.locator('.locale-switch-trigger').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    const header = page.locator(
      path === '/workspaces' ? '.workspace-landing-header' : '.ant-pro-global-header',
    )
    const hover = await checkHeaderHover({ context, page, header })
    const popup = await openPopover(page)
    const bounds = await checkPopoverBounds(page)
    assert.equal(await popup.getByRole('menuitemradio').count(), 2, '实际注册语言名单不一致')
    assert.equal(await popup.locator('[aria-checked="true"]').count(), 1)
    const registeredLocales = await popup.getByRole('menuitemradio').count()
    const searchEnabled = registeredLocales > 5
    const search = popup.getByRole('textbox')
    assert.equal(await search.count(), searchEnabled ? 1 : 0, '搜索框显隐未按注册语言总数判断')
    if (!searchEnabled) {
      assert(
        await popup
          .locator('[aria-checked="true"]')
          .evaluate((element) => element === document.activeElement),
        '无搜索时未聚焦当前语言',
      )
    }
    await page.screenshot({
      path: resolve(uiRoot, `language-popover-${name}.png`),
      fullPage: true,
      animations: 'disabled',
    })
    if (name === 'company-desktop') {
      await page.screenshot({
        path: resolve(uiRoot, 'language-popover-detail.png'),
        clip: { x: width - 640, y: 0, width: 640, height: 370 },
        animations: 'disabled',
      })
    }
    if (searchEnabled) {
      await search.fill('eN_uS')
      assert.equal(await popup.getByRole('menuitemradio').count(), 1)
      assert((await popup.getByRole('menuitemradio').innerText()).includes('English'))
      assert.equal(await search.count(), 1, '搜索到少量结果后搜索框消失')
      await search.fill('not-a-language')
      assert.equal(await popup.getByRole('menuitemradio').count(), 0)
      await popup
        .getByText(locale === 'zh_CN' ? '没有匹配的语言' : 'No matching languages')
        .waitFor()
      assert.equal(await search.count(), 1, '空结果时搜索框消失')
    }
    await page.keyboard.press('Escape')
    await popup.waitFor({ state: 'hidden' })
    assert(
      await page
        .locator('.locale-switch-trigger')
        .evaluate((element) => element === document.activeElement),
    )
    await openPopover(page)
    if (searchEnabled) {
      assert.equal(await page.locator('.locale-switch-popover input').inputValue(), '')
      await page.keyboard.press('ArrowDown')
    } else {
      assert.equal(await popup.getByRole('textbox').count(), 0)
      await page.keyboard.press('Home')
    }
    assert(
      await popup
        .getByRole('menuitemradio')
        .first()
        .evaluate((element) => element === document.activeElement),
    )
    await page.keyboard.press('End')
    assert(
      await popup
        .getByRole('menuitemradio')
        .last()
        .evaluate((element) => element === document.activeElement),
    )
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowUp')
    assert(
      await popup
        .getByRole('menuitemradio')
        .last()
        .evaluate((element) => element === document.activeElement),
    )
    const next = locale === 'zh_CN' ? 'English' : '简体中文'
    await popup.getByRole('menuitemradio').filter({ hasText: next }).click()
    await popup.waitFor({ state: 'hidden' })
    const nextLang = locale === 'zh_CN' ? 'en' : 'zh-CN'
    await page.waitForFunction((value) => document.documentElement.lang === value, nextLang)
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('wanwu-locale'))),
      locale === 'zh_CN' ? 'en_US' : 'zh_CN',
    )
    assert(
      await page
        .locator('.locale-switch-trigger')
        .evaluate((element) => element === document.activeElement),
      '选择后未恢复入口焦点',
    )
    await openPopover(page)
    assert((await popup.locator('[aria-checked="true"]').innerText()).includes(next))
    await page.locator('.workspace-account-trigger').click()
    await popup.waitFor({ state: 'hidden' })
    const panel = page.locator('.workspace-account-panel')
    await panel.waitFor({ state: 'visible' })
    assert.equal(await panel.locator('strong').innerText(), user.name)
    assert.equal(await panel.locator('.workspace-account-details > span').innerText(), user.account)
    if (path !== '/workspaces') assert.equal(await panel.locator('small').count(), 1)
    if (width === 1440) {
      const english = nextLang === 'en'
      await page.getByRole('menuitem', { name: english ? 'Change Password' : '修改密码' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      assert.deepEqual(
        await dialog
          .locator('input[type="password"]')
          .evaluateAll((items) => items.map((item) => item.value)),
        ['', '', ''],
      )
      await dialog.getByRole('button', { name: english ? 'Cancel' : /取\s*消/ }).click()
      await dialog.waitFor({ state: 'hidden' })
      await page.locator('.workspace-account-trigger').click()
      await page.getByRole('menuitem', { name: english ? 'Sign Out' : '退出登录' }).click()
      await page.waitForURL('**/login')
      assert.equal(logoutRequests, 1)
      assert.equal(
        (await context.cookies()).some((cookie) => cookie.name === 'token'),
        false,
      )
    }
    assert.deepEqual(unexpected, [])
    assert.deepEqual(pageErrors, [])
    report.checks.push({
      name,
      path,
      width,
      locale,
      reducedMotion,
      bounds,
      hover,
      search: { visible: searchEnabled, registeredLocales, threshold: 5, visibilityChecked: true },
      keyboard: true,
      switchLanguage: true,
      account: true,
      accountActions: width === 1440,
      passed: true,
    })
    console.log(`PASS ${name}`)
  } catch (error) {
    report.failures.push({ name, message: error.message, unexpected, pageErrors })
    await page.screenshot({
      path: resolve(uiRoot, `language-popover-${name}-failure.png`),
      fullPage: true,
    })
    console.error(`FAIL ${name}: ${error.message}; ${JSON.stringify({ unexpected, pageErrors })}`)
  } finally {
    await context.close()
  }
}

const paths = {
  workspaces: '/workspaces',
  company: '/companies/qa-company',
  project: '/companies/qa-company/projects/qa-project',
  platform: '/platform',
}
try {
  for (const [scope, path] of Object.entries(paths)) {
    await scenario({ name: `${scope}-desktop`, path, width: 1440 })
    if (scope !== 'platform') {
      await scenario({ name: `${scope}-mobile`, path, width: 390 })
      await scenario({ name: `${scope}-narrow`, path, width: 320 })
    }
  }
  await scenario({ name: 'company-english', path: paths.company, width: 1440, locale: 'en_US' })
  await scenario({
    name: 'project-reduced-motion',
    path: paths.project,
    width: 1440,
    reducedMotion: 'reduce',
  })
} finally {
  await writeFile(
    resolve(reportRoot, 'language-popover.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
console.log(`完成：${report.checks.length} 通过，${report.failures.length} 失败`)
process.exitCode = report.failures.length ? 1 : 0
