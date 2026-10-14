import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureResponse } from '../../../04.界面与主题/万物梦幻/工具/fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.P0_UI_BASE_URL || 'http://127.0.0.1:5187'
const report = {
  baseUrl,
  simulatedApi: true,
  checks: [],
  requests: [],
  pageErrors: [],
  unexpectedRequests: [],
  failures: [],
}
await mkdir(resolve(featureRoot, 'ui'), { recursive: true })
await mkdir(resolve(featureRoot, '测试证据'), { recursive: true })
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
context.setDefaultTimeout(10_000)
await context.addCookies([{ name: 'token', value: 'qa-only-noncredential', url: baseUrl }])
await context.addInitScript(() => localStorage.setItem('wanwu-locale', JSON.stringify('zh_CN')))
await context.route('**/api/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const body = fixtureResponse(url, 'filled')
  if (request.method() !== 'GET' || body === undefined) {
    report.unexpectedRequests.push(`${request.method()} ${url.pathname}`)
    return route.fulfill({ status: 405, json: { message: '页面专项验证禁止真实后端写入。' } })
  }
  return route.fulfill({ status: 200, json: body })
})
const page = await context.newPage()
page.on('pageerror', (error) => report.pageErrors.push(error.message))
page.on('request', (request) => {
  if (['fetch', 'xhr'].includes(request.resourceType()))
    report.requests.push(new URL(request.url()).pathname)
})

/** 等待页面载入模拟接口数据，避免把旧页面内容作为新场景证据。 */
async function visit(path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
}

/** 记录实际断言结果与脱敏截图，失败后仍保存报告供定位。 */
async function check({ name, run }) {
  try {
    await run()
    await page.screenshot({ path: resolve(featureRoot, 'ui', `p0-${name}.png`), fullPage: true })
    report.checks.push({ name, passed: true })
  } catch (error) {
    report.failures.push({
      name,
      message: error.message,
      text: await page.locator('body').innerText(),
    })
    await page.screenshot({
      path: resolve(featureRoot, 'ui', `p0-${name}-failure.png`),
      fullPage: true,
    })
  }
}

try {
  await check({
    name: 'independent-company-form',
    run: async () => {
      await visit('/platform/companies')
      assert.equal(await page.getByRole('button', { name: /层级|移动企业/ }).count(), 0)
      await page.getByRole('button', { name: '开通企业' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      const labels = await dialog.locator('.ant-form-item-label').allTextContents()
      assert(labels.some((label) => label.includes('企业名称')))
      assert(labels.some((label) => label.includes('首位企业管理员')))
      assert(!labels.some((label) => /父级|类型|排序|层级/.test(label)))
    },
  })
  await check({
    name: 'invitation-disabled',
    run: async () => {
      await visit('/companies/qa-company/members')
      const invitation = page.getByRole('button', { name: '邀请成员（待确认）' })
      await invitation.waitFor()
      assert(await invitation.isDisabled())
      await invitation.locator('..').hover()
      await page.getByRole('tooltip').filter({ hasText: '邀请流程尚待确认，暂不可用' }).waitFor()
      assert.equal(await page.getByRole('dialog').count(), 0)
    },
  })
  await check({
    name: 'direct-registration',
    run: async () => {
      await page.getByRole('button', { name: '直接注册' }).click()
      await page.getByRole('dialog').filter({ hasText: '直接注册企业成员' }).waitFor()
      assert.equal(await page.getByRole('button', { name: '注册并加入企业' }).count(), 1)
    },
  })
  await check({
    name: 'project-member-entry',
    run: async () => {
      await visit('/companies/qa-company/projects/qa-project/members')
      await page.getByRole('button', { name: '添加成员' }).click()
      const dialog = page.getByRole('dialog').filter({ hasText: '添加项目成员' })
      await dialog.waitFor()
      assert.match(await dialog.innerText(), /只能选择所属企业中有效且尚未加入本项目的成员/)
    },
  })
  await check({
    name: 'retired-acceptance-route',
    run: async () => {
      await visit('/member-invitations/accept?token=qa-placeholder')
      await page.getByText('页面不存在', { exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: /接受邀请|拒绝邀请/ }).count(), 0)
      assert.equal(await page.getByText('企业成员邀请', { exact: true }).count(), 0)
    },
  })
} finally {
  await browser.close()
  await writeFile(
    resolve(featureRoot, '测试证据', 'p0-ui.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
}
console.log(JSON.stringify(report, null, 2))
assert.equal(report.failures.length, 0, '页面专项检查失败')
assert.equal(report.unexpectedRequests.length, 0, '出现未配置或写入请求')
assert.equal(report.pageErrors.length, 0, '页面存在未处理错误')
