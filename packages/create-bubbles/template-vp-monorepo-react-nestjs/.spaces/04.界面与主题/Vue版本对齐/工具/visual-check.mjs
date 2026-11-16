import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { install } from './fixtures.mjs'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const output = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const report = {
  executedAt: new Date().toISOString(),
  mockData: true,
  checks: [],
  failures: [],
  runtimeErrors: [],
  unexpected: [],
}
const applications = [
  { name: 'react', baseUrl: process.env.REACT_TEST_URL || 'http://127.0.0.1:10001' },
  { name: 'vue', baseUrl: process.env.VUE_TEST_URL || 'http://127.0.0.1:10000' },
]
const scenes = [
  { name: 'login', path: '/login', authenticated: false },
  { name: 'register', path: '/register', authenticated: false },
  { name: 'workspaces', path: '/workspaces', authenticated: true },
  { name: 'company-home', path: '/companies/qa-company', authenticated: true },
  { name: 'company-members', path: '/companies/qa-company/members', authenticated: true },
  { name: 'mobile-login', path: '/login', authenticated: false, mobile: true },
  { name: 'mobile-register', path: '/register', authenticated: false, mobile: true },
  { name: 'mobile-workspaces', path: '/workspaces', authenticated: true, mobile: true },
  {
    name: 'mobile-company-home',
    path: '/companies/qa-company',
    authenticated: true,
    mobile: true,
  },
  {
    name: 'mobile-members',
    path: '/companies/qa-company/members',
    authenticated: true,
    mobile: true,
  },
]
await mkdir(resolve(output, 'ui'), { recursive: true })
await mkdir(resolve(output, '测试证据'), { recursive: true })
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',
  headless: true,
})
report.browser = browser.version()

/** 使用相同虚构接口与视口生成两版页面，记录布局边界及运行异常。 */
async function capture(application, scene) {
  const context = await browser.newContext({
    viewport: scene.mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  })
  const state = await install(context)
  if (scene.authenticated)
    await context.addCookies([
      { name: 'token', value: 'qa-only-noncredential', url: application.baseUrl },
    ])
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) =>
    report.runtimeErrors.push({ app: application.name, scene: scene.name, message: error.message }),
  )
  try {
    await page.goto(application.baseUrl + scene.path)
    await page.waitForLoadState('networkidle')
    await page.locator('#nprogress').waitFor({ state: 'detached' })
    await page.evaluate(() => document.fonts.ready)
    assert.equal(new URL(page.url()).pathname, scene.path)
    if (scene.name.endsWith('members'))
      await page.getByRole('cell', { name: '演示用户', exact: true }).first().waitFor()
    if (scene.name.endsWith('company-home'))
      await page.getByText('可用功能', { exact: true }).waitFor()
    const metrics = await page.evaluate(() => {
      const selectors = {
        header: '.workspace-header, .ant-pro-global-header',
        sidebar: '.workspace-sidebar, .ant-layout-sider',
        main: '.workspace-body',
        search: '[data-pro-table-search], .ant-pro-table-search',
        table: '[data-pro-table-container], .ant-pro-table > .ant-pro-card',
        form: '.login-panel, .login-card',
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        landmarks: Object.fromEntries(
          Object.entries(selectors).map(([name, selector]) => {
            const element = document.querySelector(selector)
            if (!element) return [name, null]
            const { x, y, width, height } = element.getBoundingClientRect()
            return [name, { x, y, width, height }]
          }),
        ),
      }
    })
    assert.ok(metrics.documentWidth <= metrics.viewport.width, '页面存在整页横向溢出')
    const filename = `${application.name}-${scene.name}.png`
    await page.screenshot({ path: resolve(output, 'ui', filename), fullPage: true })
    report.checks.push({ app: application.name, scene: scene.name, screenshot: filename, metrics })
    console.log(`PASS ${application.name} ${scene.name}`)
    if (application.name === 'vue' && scene.name === 'login') await checkLocaleKeyboard(page)
    if (application.name === 'vue' && scene.name === 'company-home') await checkSidebar(page)
  } catch (error) {
    report.failures.push({ app: application.name, scene: scene.name, message: error.message })
    console.log(`FAIL ${application.name} ${scene.name}: ${error.message}`)
  } finally {
    report.unexpected.push(
      ...state.unexpected.map((request) => ({ app: application.name, scene: scene.name, request })),
    )
    await context.close()
  }
}

/** 确认桌面收起时菜单与侧栏同步缩窄，再展开恢复完整导航。 */
async function checkSidebar(page) {
  await page.getByRole('button', { name: '收起菜单', exact: true }).click()
  await page.locator('.workspace-sidebar .ant-menu-inline-collapsed').waitFor()
  assert.equal(
    await page
      .locator('.workspace-sidebar')
      .evaluate((element) => element.getBoundingClientRect().width),
    64,
  )
  await page.getByRole('button', { name: '展开菜单', exact: true }).click()
  await page.locator('.workspace-sidebar .ant-menu-inline-collapsed').waitFor({ state: 'detached' })
  assert.equal(
    await page
      .locator('.workspace-sidebar')
      .evaluate((element) => element.getBoundingClientRect().width),
    232,
  )
  report.checks.push({ app: 'vue', scene: 'sidebar-collapse' })
}

/** 验证语言面板打开、循环定位、Escape 和外部焦点关闭，避免视觉调整破坏键盘操作。 */
async function checkLocaleKeyboard(page) {
  const trigger = page.locator('.locale-switch-trigger')
  await trigger.click()
  const selected = page.getByRole('menuitemradio', { name: /简体中文/ })
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-checked') === 'true')
  await selected.press('ArrowDown')
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent?.includes('English')),
    true,
  )
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true)
  await trigger.click()
  await selected.waitFor()
  const input = page.locator('input').first()
  await input.focus()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await input.evaluate((element) => element === document.activeElement), true)
  report.checks.push({ app: 'vue', scene: 'locale-keyboard' })
}

try {
  for (const application of applications)
    for (const scene of scenes) await capture(application, scene)
} finally {
  await browser.close()
  await writeFile(
    resolve(output, '测试证据', 'visual-report.json'),
    JSON.stringify(report, null, 2),
  )
}
if (report.failures.length || report.runtimeErrors.length || report.unexpected.length)
  process.exitCode = 1
