import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { base, install, scopes } from './fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = resolve(featureRoot, '../../..')
const catalog = await import(pathToFileURL(resolve(repoRoot, 'packages/shared/dist/utils.js')))
const baseUrl = process.argv[2] || 'http://127.0.0.1:9999'
const report = {
  executedAt: new Date().toISOString(),
  mockHttp: true,
  checks: [],
  failures: [],
  images: [],
}
await mkdir(resolve(featureRoot, 'ui'), { recursive: true })
await mkdir(resolve(featureRoot, '测试证据'), { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const state = await install({ context, baseUrl, catalog })
const page = await context.newPage()
page.setDefaultTimeout(12000)
const errors = []
const diagnostics = []
const pendingRequests = new Set()
page.on('request', (entry) => pendingRequests.add(entry.url()))
page.on('requestfinished', (entry) => pendingRequests.delete(entry.url()))
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (entry) => {
  if (entry.type() === 'error') diagnostics.push(entry.text())
})
page.on('requestfailed', (entry) =>
  diagnostics.push(`${entry.url()}: ${entry.failure()?.errorText}`),
)
page.on('response', (entry) => {
  if (entry.status() >= 400) diagnostics.push(`${entry.status()} ${entry.url()}`)
})

/** 检查列表已呈现真实字典页面，且工作空间菜单包含数据字典入口。 */
async function open(scope) {
  await page.goto(`${baseUrl}${base(scope)}/dictionaries`)
  await page.getByRole('button', { name: /新增字典/ }).waitFor()
  await page.getByText(`${scope.type}计量单位`, { exact: true }).waitFor()
  await page.getByRole('menuitem').filter({ hasText: '数据字典' }).waitFor()
}

/** 保存截图作为执行证据，页面只含本工具创建的虚构数据。 */
async function capture(name) {
  const file = `ui/${name}.png`
  await page.screenshot({
    path: resolve(featureRoot, file),
    fullPage: true,
    animations: 'disabled',
  })
  report.images.push(file)
}

try {
  report.browserVersion = browser.version()
  for (const scope of scopes) {
    await open(scope)
    report.checks.push(`${scope.type}: 菜单、路由、字典列表`)
  }
  await open(scopes[0])
  await page.getByRole('button', { name: /新增字典/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('字典编码').fill('browser_units')
  await dialog.getByLabel('字典名称').fill('浏览器测试字典')
  await dialog.getByRole('button', { name: '新增选项' }).click()
  await dialog.getByLabel('选项值').fill('cm')
  await dialog.getByLabel('显示名称').fill('厘米')
  await capture('platform-create')
  await dialog.getByRole('button', { name: /确.*定/ }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByText('浏览器测试字典', { exact: true }).waitFor()
  assert.equal(state.writes.at(-1).body.items[0].value, 'cm')
  report.checks.push('平台新增字典与选项提交成功')

  const row = page.getByRole('row').filter({ hasText: '浏览器测试字典' })
  await row.getByRole('button', { name: '预览选项' }).click()
  await page.getByRole('combobox', { name: '业务选项' }).click()
  await page.locator('.ant-select-item-option').filter({ hasText: '厘米' }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').locator('button.ant-modal-close').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const firstReads = state.optionRequests.length
  await page.reload()
  await page.getByRole('button', { name: /新增字典/ }).waitFor()
  await page
    .getByRole('row')
    .filter({ hasText: '浏览器测试字典' })
    .getByRole('button', { name: '预览选项' })
    .click()
  await page.getByRole('combobox', { name: '业务选项' }).click()
  await page.locator('.ant-select-item-option').filter({ hasText: '厘米' }).waitFor()
  assert.equal(state.optionRequests.length, firstReads, '刷新后匹配快照应复用')
  const persisted = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('bubbles.dictionary-cache')),
  )
  assert.equal(persisted.ownerUserId, '33333333-3333-4333-8333-333333333333')
  assert(!JSON.stringify(persisted).includes('dictionary-test-session'))
  report.checks.push('真实选择框读取选项，刷新恢复 sessionStorage 且不重复请求选项')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').locator('button.ant-modal-close').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })

  await page
    .getByRole('row')
    .filter({ hasText: '浏览器测试字典' })
    .getByRole('button', { name: '编辑', exact: true })
    .click()
  assert(await dialog.getByLabel('字典编码').isDisabled())
  assert(await dialog.getByLabel('选项值').isDisabled())
  await dialog.getByLabel('显示名称').fill('厘米（已更新）')
  await capture('platform-edit')
  await dialog.getByRole('button', { name: /确.*定/ }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(state.writes.at(-1).body.expectedVersion, 1)
  assert(!('code' in state.writes.at(-1).body))
  await page
    .getByRole('row')
    .filter({ hasText: '浏览器测试字典' })
    .getByRole('button', { name: '预览选项' })
    .click()
  await page.getByRole('combobox', { name: '业务选项' }).click()
  await page.locator('.ant-select-item-option').filter({ hasText: '厘米（已更新）' }).waitFor()
  assert.equal(state.optionRequests.length, firstReads + 1)
  report.checks.push('编辑保护编码和值，提交版本号，保存后缓存失效并显示新选项')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').locator('button.ant-modal-close').click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })

  for (const scope of scopes.slice(1)) {
    await open(scope)
    await page
      .getByRole('row')
      .filter({ hasText: `${scope.type}计量单位` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    assert.equal(await dialog.getByLabel('字典名称').inputValue(), `${scope.type}计量单位`)
    assert(await dialog.getByLabel('选项值').isDisabled())
    await dialog.getByLabel('显示名称').fill(`${scope.type}米`)
    await dialog.getByLabel('排序', { exact: true }).fill('3')
    await dialog.getByRole('button', { name: /确.*定/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(state.writes.at(-1).scope, scope.type)
    assert.equal(state.writes.at(-1).body.items[0].sort, 3)
    await page.getByRole('button', { name: /新增字典/ }).click()
    assert.equal(await dialog.getByLabel('字典编码').inputValue(), '')
    assert(!(await dialog.getByLabel('字典编码').isDisabled()))
    assert.equal(await dialog.getByLabel('选项值').count(), 0)
    await dialog.getByLabel('字典编码').fill('browser_units')
    await dialog.getByLabel('字典名称').fill(`${scope.type}新增字典`)
    await dialog.getByRole('button', { name: /确.*定/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.getByText(`${scope.type}新增字典`, { exact: true }).waitFor()
    assert.equal(state.writes.at(-1).scope, scope.type)
    assert.deepEqual(state.writes.at(-1).body.items, [])
    await capture(`${scope.type}-list`)
    report.checks.push(
      `${scope.type}: 编辑选项名称与排序、新增空字典、重复打开表单状态重置、同编码独立提交`,
    )
  }
  assert.deepEqual(state.unexpected, [])
  assert.deepEqual(errors, [])
} catch (error) {
  report.failures.push({ name: error.name, message: error.message })
  report.pageErrors = errors
  report.diagnostics = diagnostics
  report.unexpectedRequests = state.unexpected
  report.failedUrl = page.url()
  report.pendingRequests = [...pendingRequests]
  report.document = await page.evaluate(() => ({
    body: document.body.innerText,
    resources: performance.getEntriesByType('resource').length,
  }))
  await capture('browser-failure')
  process.exitCode = 1
} finally {
  await browser.close()
  await writeFile(resolve(featureRoot, '测试证据/browser.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
