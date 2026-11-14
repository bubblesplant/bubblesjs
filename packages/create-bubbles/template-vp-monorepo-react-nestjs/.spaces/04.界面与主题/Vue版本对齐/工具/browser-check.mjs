import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { install, pages } from './fixtures.mjs'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const output = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.VUE_TEST_URL || 'http://127.0.0.1:5196'
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',
  headless: true,
})
const report = {
  executedAt: new Date().toISOString(),
  baseUrl,
  mockData: true,
  browser: browser.version(),
  checks: [],
  failures: [],
  runtimeErrors: [],
  unexpected: [],
}
await mkdir(resolve(output, 'ui'), { recursive: true })
await mkdir(resolve(output, '测试证据'), { recursive: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
const state = await install(context)
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (error) => report.runtimeErrors.push(error.message))

/** 记录每个独立验收场景，失败时保存界面，继续发现其他问题。 */
async function check(name, run) {
  if (process.argv[2] && !name.includes(process.argv[2])) return
  try {
    await run()
    report.checks.push(name)
    console.log(`PASS ${name}`)
  } catch (error) {
    report.failures.push({ name, message: error.message })
    console.log(`FAIL ${name}: ${error.message.slice(0, 500)}`)
    await page.screenshot({ path: resolve(output, 'ui', `failure-${name}.png`), fullPage: true })
  }
}
/** 等待异步页面及表格稳定，截图仅包含本地虚构数据。 */
async function visit(path) {
  await page.goto(baseUrl + path)
  await page.waitForSelector('h1, h2')
  await page.locator('#nprogress').waitFor({ state: 'hidden' })
  await page
    .locator('.ant-spin-spinning')
    .waitFor({ state: 'hidden' })
    .catch(() => {})
}

/** 等待导航请求结束且进度元素被移除，避免截图保留进度条淡出残影。 */
async function capture(name) {
  await page.waitForLoadState('networkidle')
  await page.locator('#nprogress').waitFor({ state: 'detached' })
  await page.screenshot({ path: resolve(output, 'ui', name), fullPage: true })
}

try {
  await check('login', async () => {
    await visit('/login')
    await page.getByRole('button', { name: /^登\s*录$/ }).click()
    await page.getByText('请输入账号', { exact: true }).last().waitFor()
    assert.equal(state.writes.length, 0)
    await capture('login.png')
    await page.locator('input').nth(0).fill('vue_qa')
    await page.locator('input').nth(1).fill('FictionalPass2026')
    await page.getByRole('button', { name: /^登\s*录$/ }).click()
    await page.waitForURL('**/workspaces')
    await page.getByText('星屿演示企业', { exact: true }).first().waitFor()
  })
  await context.addCookies([{ name: 'token', value: 'qa-only-noncredential', url: baseUrl }])
  await check('workspaces', async () => {
    await visit('/workspaces')
    assert.equal(await page.locator('.workspace-card').count(), 3)
    await capture('workspaces.png')
  })
  for (const definition of pages) {
    const path = definition.path
      .replace(':companyId', 'qa-company')
      .replace(':projectId', 'qa-project')
    await check(definition.routeKey, async () => {
      await visit(path)
      await page.getByRole('heading', { name: definition.title, exact: true }).waitFor()
      assert.equal(new URL(page.url()).pathname, path)
      if (definition.routeKey === 'company.organization.templates')
        await page.getByText('项目协作模板', { exact: true }).first().waitFor()
      if (definition.routeKey === 'company.members')
        await page.getByRole('cell', { name: '演示用户', exact: true }).waitFor()
      if (definition.routeKey === 'platform.companies')
        await page.getByRole('cell', { name: '星屿演示企业', exact: true }).waitFor()
      if (definition.routeKey === 'company.home') await capture('company-home.png')
      if (definition.routeKey === 'company.members') await capture('company-members.png')
    })
  }
  for (const path of [
    '/examples/pro-table',
    '/examples/pro-table/draft',
    '/examples/i18n',
    '/examples/selector',
  ]) {
    await check(path.split('/').slice(2).join('-'), async () => {
      await visit(path)
      assert.ok((await page.locator('main').innerText()).length > 50)
    })
  }
  await check('register-validation', async () => {
    await visit('/register')
    const fields = page.locator('.auth-form input')
    await fields.nth(0).fill('虚构注册用户')
    await fields.nth(1).fill('vue_qa_new')
    await fields.nth(2).fill('FictionalPass2026')
    await fields.nth(3).fill('DifferentPass2026')
    const before = state.writes.length
    await page.getByRole('button', { name: /^注\s*册$/ }).click()
    await page.getByText('两次输入的密码不一致', { exact: true }).waitFor()
    assert.equal(state.writes.length, before)
    await fields.nth(3).fill('FictionalPass2026')
    await page.getByRole('button', { name: /^注\s*册$/ }).click()
    await page.waitForURL('**/login?registered=1')
    assert.equal(state.writes.at(-1).path, '/auth/register')
  })
  await check('workspace-navigation', async () => {
    await visit('/workspaces')
    await page
      .locator('.workspace-card')
      .filter({ has: page.getByRole('heading', { name: '星屿演示企业', exact: true }) })
      .click()
    await page.waitForURL('**/companies/qa-company')
    await page.getByRole('button', { name: '切换空间', exact: true }).click()
    await page.waitForURL('**/workspaces')
  })
  await check('dictionary-write-and-conflict', async () => {
    await visit('/companies/qa-company/dictionaries')
    await page.getByRole('button', { name: /新增.*字典/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('字典名称', { exact: true }).fill('验收状态')
    await dialog.getByLabel('字典编码', { exact: true }).fill('qa_state')
    await dialog.getByRole('button', { name: /新增选项/ }).click()
    const row = dialog.locator('tbody tr').first()
    await row.locator('input').nth(0).fill('ready')
    await row.locator('input').nth(1).fill('待处理')
    state.failNext = '/dictionaries'
    await dialog.getByRole('button', { name: /^保\s*存$/ }).click()
    await page.getByText('模拟版本冲突，请刷新后重试', { exact: true }).waitFor()
    assert.equal(await dialog.getByLabel('字典名称', { exact: true }).inputValue(), '验收状态')
    await dialog.getByRole('button', { name: /^保\s*存$/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    const created = page.getByRole('row').filter({ hasText: '验收状态' })
    await created.getByRole('button', { name: /^编\s*辑$/ }).click()
    assert.equal(await dialog.getByLabel('字典编码', { exact: true }).isDisabled(), true)
    assert.equal(
      await dialog.locator('tbody tr').first().locator('input').first().isDisabled(),
      true,
    )
    assert.equal(
      await dialog
        .getByRole('button', { name: /^删\s*除$/ })
        .first()
        .isDisabled(),
      true,
    )
    await dialog.getByLabel('字典名称', { exact: true }).fill('验收状态更新')
    await dialog.getByRole('button', { name: /^保\s*存$/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(state.writes.at(-1).body.expectedVersion, 1)
  })
  await check('position-write', async () => {
    await visit('/companies/qa-company/positions')
    await page.getByRole('button', { name: /创建岗位/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('岗位名称', { exact: true }).fill('验收工程师')
    await dialog.getByLabel('编码', { exact: true }).fill('qa_engineer')
    await dialog.getByRole('button', { name: /^保\s*存$/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(state.writes.at(-1).body.code, 'qa_engineer')
  })
  await check('role-permission-dependency', async () => {
    await visit('/companies/qa-company/roles')
    await page.getByRole('button', { name: '配置权限', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const group = dialog
      .locator('.panel')
      .filter({ has: page.getByRole('checkbox', { name: '企业角色', exact: true }) })
    const operation = group.getByRole('checkbox').nth(1)
    await operation.check()
    assert.equal(await group.getByRole('checkbox').first().isChecked(), true)
    await group.getByRole('checkbox').first().uncheck()
    assert.equal(await operation.isChecked(), false)
    await operation.check()
    await dialog.getByRole('button', { name: /^确\s*定$/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    const write = state.writes.findLast((w) => w.path.endsWith('/permissions'))
    assert.equal(write.body.expectedVersion, 1)
    assert.ok(write.body.permissionKeys.includes('company.roles.read'))
    assert.ok(write.body.permissionKeys.length >= 2)
  })
  await check('member-relations', async () => {
    await visit('/companies/qa-company/members')
    await page.getByRole('button', { name: '组织归属', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('研发团队', { exact: true }).first().waitFor()
    await dialog.getByRole('button', { name: /^确\s*定$/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    const body = state.writes.at(-1).body
    assert.deepEqual(body.relations, [{ organizationUnitId: 'qa-unit', duty: 'member' }])
    await page.getByRole('button', { name: '岗位任职', exact: true }).click()
    await dialog.getByText('开发工程师', { exact: true }).first().waitFor()
    await dialog.getByRole('button', { name: /^确\s*定$/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(state.writes.at(-1).body.positionIds, ['qa-position'])
  })
  await check('organization-write-and-assignment', async () => {
    await visit('/companies/qa-company/organization')
    await page.getByRole('button', { name: /新增组织/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('名称', { exact: true }).fill('验收团队')
    await dialog.getByLabel('编码', { exact: true }).fill('qa_team')
    await dialog.getByRole('button', { name: /^保\s*存$/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(state.writes.at(-1).body.parentId, null)
    await page.getByRole('button', { name: '分配成员', exact: true }).click()
    await dialog.getByText('演示用户 · vue_qa', { exact: true }).first().waitFor()
    await dialog.getByRole('button', { name: /^确\s*定$/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(state.writes.at(-1).body.members, [{ userId: 'qa-user', duty: 'member' }])
    await page.getByRole('button', { name: /^移\s*动$/ }).click()
    await dialog.getByRole('button', { name: /^保\s*存$/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(state.writes.at(-1).body.expectedVersion, 1)
  })
  await check('template-edit', async () => {
    await visit('/companies/qa-company/organization/templates')
    await page.getByRole('button', { name: '编辑定义', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('模板名称', { exact: true }).fill('验收协作模板')
    const row = dialog.locator('tbody tr').first()
    await row.locator('input').first().fill('验收研发团队')
    await dialog.getByRole('tab', { name: /岗位/ }).click()
    await dialog.getByRole('button', { name: /新增岗位/ }).click()
    const added = dialog.locator('tbody:visible tr').last()
    await added.locator('input').nth(0).fill('验收岗位')
    await added.locator('input').nth(1).fill('qa_job')
    await dialog.getByRole('button', { name: '保存模板', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    const body = state.writes.at(-1).body
    assert.equal(body.expectedVersion, 1)
    assert.equal(body.units[0].name, '验收研发团队')
    assert.equal(body.positions.length, 2)
  })
  await check('menu-directory-and-cleanup', async () => {
    await visit('/platform/menus')
    await page.getByRole('button', { name: /新增菜单节点/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('节点类型', { exact: true }).click()
    await page
      .locator('.ant-select-item-option-content:visible')
      .getByText('目录', { exact: true })
      .click()
    await dialog.getByLabel('显示名称', { exact: true }).fill('验收目录')
    await dialog.getByRole('button', { name: '保存菜单', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(state.writes.findLast((w) => w.path === '/platform/menus').body.type, 'directory')
    await page.getByRole('button', { name: /清理/ }).first().click()
    await dialog.waitFor()
    assert.equal(
      await dialog.getByRole('button', { name: '确认清理废弃权限', exact: true }).isDisabled(),
      true,
    )
    await dialog.getByText('缺少有效且完整的部署证明', { exact: true }).waitFor()
    await dialog
      .locator('.ant-modal-footer')
      .getByRole('button', { name: /^关\s*闭$/ })
      .click()
    await dialog.waitFor({ state: 'hidden' })
  })
  await check('draft-persistence', async () => {
    await visit('/examples/pro-table/draft')
    await page.getByRole('button', { name: /新增项目/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('项目名称', { exact: true }).fill('虚构未完成草稿')
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.reload()
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('bubbles-vue-demo-drafts')),
    )
    assert.ok(saved.some((r) => r.name === '虚构未完成草稿' && r.stage === 'draft'))
    await page.getByRole('button', { name: /新增项目/ }).click()
    await dialog.getByRole('button', { name: /^提\s*交$/ }).click()
    await dialog.locator('.ant-form-item-explain-error').first().waitFor()
    assert.equal(await dialog.isVisible(), true)
  })
  await check('selector-submit-and-modes', async () => {
    await visit('/examples/selector')
    await page.getByRole('button', { name: /^提\s*交$/ }).click()
    await page.getByText('请选择至少一项', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: '填入示例', exact: true }).click()
    await page.getByRole('button', { name: /^提\s*交$/ }).click()
    await page.getByRole('tab', { name: '最近提交结果', exact: true }).click()
    assert.ok((await page.locator('pre:visible').innerText()).includes('company-demo-user-0'))
    await page.getByText('单选', { exact: true }).click()
    await page.getByRole('button', { name: '填入示例', exact: true }).click()
    await page.getByRole('switch', { name: '禁用表单', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: /^提\s*交$/ }).isDisabled(), true)
  })
  await check('language-switch', async () => {
    await visit('/companies/qa-company/positions')
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await page.getByRole('heading', { name: 'Company Positions', exact: true }).waitFor()
    await page.getByRole('button', { name: '简体中文', exact: true }).click()
    await page.getByRole('heading', { name: '企业岗位', exact: true }).waitFor()
  })
  await check('mobile-navigation', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await visit('/companies/qa-company/members')
    const size = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    assert.ok(size.scroll <= size.width + 1, JSON.stringify(size))
    await page.getByRole('button', { name: '打开菜单', exact: true }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByText('企业岗位', { exact: true }).click()
    await page.waitForURL('**/positions')
    await drawer.waitFor({ state: 'hidden' })
    await capture('mobile-positions.png')
    await page.setViewportSize({ width: 1440, height: 1000 })
  })
  await check('forbidden-direct-route', async () => {
    state.deny = 'company.members.read'
    await page.goto(baseUrl + '/companies/qa-company/members')
    await page.waitForURL('**/403')
    state.deny = ''
  })
  await check('unauthorized-session', async () => {
    state.unauthorized = '/companies/qa-company/access'
    await page.goto(baseUrl + '/companies/qa-company/members')
    await page.waitForURL('**/login?**')
    assert.equal(
      (await context.cookies()).some((c) => c.name === 'token'),
      false,
    )
    state.unauthorized = ''
  })
} finally {
  report.unexpected = state.unexpected
  report.writes = state.writes
  await writeFile(
    resolve(output, '测试证据', 'browser-report.json'),
    JSON.stringify(report, null, 2),
  )
  console.log(
    JSON.stringify({
      passed: report.checks.length,
      failures: report.failures,
      errors: report.runtimeErrors,
      unexpected: report.unexpected,
    }),
  )
  await browser.close()
}
if (report.failures.length || report.runtimeErrors.length || report.unexpected.length)
  process.exitCode = 1
