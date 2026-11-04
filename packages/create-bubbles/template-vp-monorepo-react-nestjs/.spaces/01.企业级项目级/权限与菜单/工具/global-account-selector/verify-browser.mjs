import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureResponse, user } from '../../../../04.界面与主题/万物梦幻/工具/fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const baseUrl = process.argv.find((value) => /^https?:/.test(value)) || 'http://127.0.0.1:11039'
const outputRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../测试证据/global-account-selector',
)
const uiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../ui/selector-layout')
const accounts = Array.from({ length: 24 }, (_, index) => ({
  userId: `qa-account-${index + 1}`,
  name:
    index < 2 ? '测试同名' : index === 23 ? '长账号回显验证'.repeat(12) : `测试账号${index + 1}`,
  account: `qa.selector.${index + 1}`,
  status: index === 1 ? 'disabled' : index === 2 ? 'locked' : 'active',
  disabled: index === 1 || index === 2,
  disabledReason: index === 1 || index === 2 ? 'accountInactive' : null,
}))
const administrator = {
  id: 'qa-existing-admin',
  name: '测试现任',
  account: 'qa.existing',
  accountStatus: 'active',
  memberStatus: 'active',
  effective: true,
}
const report = {
  mockApi: true,
  checks: [],
  queries: [],
  saves: [],
  pageErrors: [],
  unexpectedApi: [],
}
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const page = await context.newPage()
page.on('pageerror', (error) => report.pageErrors.push(error.message))
page.setDefaultTimeout(12000)

/** 执行并记录真实浏览器中的交互断言。 */
async function check(name, action) {
  await action()
  report.checks.push(name)
}

/** 获取当前全局账号弹窗，避免与外层管理员弹窗混淆。 */
function accountDialog() {
  return page.getByRole('dialog', { name: '全局账号', exact: true })
}

/** 在选择弹窗中选择指定完整账号对应的单选行。 */
async function selectAccount(account) {
  const row = accountDialog()
    .locator('tbody tr')
    .filter({ has: page.getByText(account, { exact: true }) })
  await row.getByRole('radio').check()
}

try {
  await mkdir(uiRoot, { recursive: true })
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.slice(4)
      if (path === '/auth/login')
        return route.fulfill({
          json: {
            user,
            accessToken: 'qa-fake-selector-token',
            absoluteExpiresAt: '2030-01-01T00:00:00Z',
          },
        })
      if (path === '/platform/account-candidates') {
        const query = url.searchParams.get('query') || ''
        const current = Number(url.searchParams.get('page') || 1)
        const pageSize = Number(url.searchParams.get('pageSize') || 20)
        report.queries.push({
          query,
          page: current,
          pageSize,
          purpose: url.searchParams.get('purpose'),
        })
        const filtered = accounts.filter((account) =>
          `${account.name} ${account.account}`.includes(query),
        )
        return route.fulfill({
          json: {
            items: filtered.slice((current - 1) * pageSize, current * pageSize),
            total: filtered.length,
            page: current,
            pageSize,
          },
        })
      }
      if (path === '/platform/account-candidates/resolve') {
        const body = request.postDataJSON()
        return route.fulfill({
          json: accounts.filter((account) => body.userIds.includes(account.userId)),
        })
      }
      if (path === '/platform/companies/qa-company') {
        const company = fixtureResponse(new URL(`${baseUrl}/api/platform/companies`), 'filled')
          .items[0]
        return route.fulfill({ json: { ...company, administrators: [administrator] } })
      }
      if (path === '/platform/companies/qa-company/administrator' && request.method() === 'POST') {
        const body = request.postDataJSON()
        report.saves.push(body)
        return route.fulfill({
          json: { administrator, replacedUserId: body.replaceUserId ?? null },
        })
      }
      const body = fixtureResponse(url, 'filled')
      if (body !== undefined && request.method() === 'GET') return route.fulfill({ json: body })
      report.unexpectedApi.push(`${request.method()} ${path}`)
      return route.fulfill({ status: 501, json: { message: '专项测试未配置的 API' } })
    },
  )
  await page.goto(`${baseUrl}/login`)
  await page.getByLabel('账号', { exact: true }).fill('qa_selector')
  await page.getByLabel('密码', { exact: true }).fill('qa_selector_only')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await page.getByRole('link', { name: /平台管理/ }).click()
  await page.getByRole('link', { name: '企业管理', exact: true }).first().click()
  await page.getByRole('button', { name: '设置管理员', exact: true }).first().click()
  const adminDialog = page.getByRole('dialog', { name: /设置企业管理员/ })
  const field = adminDialog.getByLabel('新管理员', { exact: true })

  await check('字段挂载不预加载账号，点击打开全局账号分页弹窗', async () => {
    assert.equal(report.queries.length, 0)
    await field.click()
    await accountDialog().getByText(accounts[0].account, { exact: true }).waitFor()
    assert.equal(report.queries[0].pageSize, 20)
    assert.equal(report.queries[0].purpose, 'setCompanyAdministrator')
  })
  await check('同名账号显示完整账号，停用及锁定账号禁止选择', async () => {
    for (const account of accounts.slice(1, 3)) {
      const radio = accountDialog()
        .locator('tbody tr')
        .filter({ has: page.getByText(account.account, { exact: true }) })
        .getByRole('radio')
      assert.equal(await radio.isDisabled(), true)
    }
    assert.equal(await accountDialog().getByText('测试同名', { exact: true }).count(), 2)
  })
  await check('空选、单选、移除和清空保持弹窗与表格位置，已选容器始终占位', async () => {
    const dialog = accountDialog()
    const table = dialog.locator('[class*="tablePanel"]')
    const panel = dialog.locator('[class*="selectionPanel"]')
    await dialog.screenshot({ path: resolve(uiRoot, '账号空选择.png') })
    const before = { dialog: await dialog.boundingBox(), table: await table.boundingBox() }
    const panelBounds = await panel.boundingBox()
    assert(panelBounds.x >= before.table.x + before.table.width)
    assert.equal(await panel.getByRole('button', { name: '清空选择' }).isDisabled(), true)
    assert(await panel.getByText('从左侧选择账号', { exact: true }).isVisible())
    assert(await panel.getByLabel('已选择 0 项', { exact: true }).isVisible())
    await selectAccount(accounts[0].account)
    const selectedLabel = panel.getByText(`${accounts[0].name} · ${accounts[0].account}`, {
      exact: true,
    })
    await selectedLabel.hover()
    await page.getByRole('tooltip').filter({ hasText: accounts[0].account }).waitFor()
    assert(await panel.getByLabel('已选择 1 项', { exact: true }).isVisible())
    await dialog.getByRole('button', { name: '清空选择' }).hover()
    await page.getByRole('tooltip').waitFor({ state: 'hidden' })
    report.checks.push('空态给出选择提示与数量；账号标签悬停可查看完整账号，悬停不移动表格')
    await dialog.screenshot({ path: resolve(uiRoot, '账号已选侧栏.png') })
    const selected = { dialog: await dialog.boundingBox(), table: await table.boundingBox() }
    await panel.locator('.ant-tag-close-icon').click()
    assert.equal(await dialog.getByRole('radio').first().isChecked(), false)
    await selectAccount(accounts[0].account)
    await panel.getByRole('button', { name: '清空选择', exact: true }).click()
    const cleared = { dialog: await dialog.boundingBox(), table: await table.boundingBox() }
    for (const result of [selected, cleared]) {
      for (const area of ['dialog', 'table']) {
        for (const key of ['x', 'y', 'width', 'height']) {
          assert(
            Math.abs(result[area][key] - before[area][key]) <= 1,
            `${area}.${key} 发生布局偏移`,
          )
        }
      }
    }
    report.layout = { before, selected, cleared }
  })
  await check('服务端分页后确认，回填姓名与完整账号', async () => {
    await accountDialog().locator('.ant-pagination-item-2').click()
    await accountDialog().getByText(accounts[23].account, { exact: true }).waitFor()
    assert.equal(report.queries.at(-1).page, 2)
    await selectAccount(accounts[23].account)
    const overflow = await accountDialog()
      .locator('[class*="selectedItems"]')
      .evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }))
    assert(overflow.scrollWidth <= overflow.width)
    await accountDialog().screenshot({ path: resolve(uiRoot, '账号长名称.png') })
    await accountDialog()
      .getByRole('button', { name: /确定选择/, exact: true })
      .click()
    await accountDialog().waitFor({ state: 'hidden' })
    assert.match(
      await field.locator('xpath=ancestor::div[contains(@class,"ant-select")]').first().innerText(),
      /qa\.selector\.24/,
    )
  })
  await check('再次打开保留已选账号，修改后取消保持原值', async () => {
    await field.click()
    await accountDialog().getByText(accounts[0].account, { exact: true }).waitFor()
    await selectAccount(accounts[0].account)
    await accountDialog()
      .getByRole('button', { name: /取\s*消/, exact: true })
      .click()
    await accountDialog().waitFor({ state: 'hidden' })
    assert.match(await adminDialog.innerText(), /qa\.selector\.24/)
  })
  await check('键盘打开弹窗，搜索姓名或账号后确认回填', async () => {
    for (const key of [' ', 'ArrowDown']) {
      await field.focus()
      await field.press(key)
      await accountDialog().getByText(accounts[0].account, { exact: true }).waitFor()
      await accountDialog()
        .getByRole('button', { name: /取\s*消/, exact: true })
        .click()
      await accountDialog().waitFor({ state: 'hidden' })
    }
    await field.focus()
    await field.press('Enter')
    await accountDialog().getByPlaceholder('搜索姓名或账号').fill(accounts[0].account)
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/account-candidates?') &&
          new URL(response.url()).searchParams.get('query') === accounts[0].account,
      ),
      accountDialog()
        .getByRole('button', { name: /查\s*询/ })
        .click(),
    ])
    await selectAccount(accounts[0].account)
    await accountDialog()
      .getByRole('button', { name: /确定选择/, exact: true })
      .click()
    await accountDialog().waitFor({ state: 'hidden' })
    assert.match(await adminDialog.innerText(), /qa\.selector\.1/)
  })
  await check('清空字段不打开选择弹窗，并可重新选择', async () => {
    const select = field.locator('xpath=ancestor::div[contains(@class,"ant-select")]').first()
    await select.hover()
    await select.locator('.ant-select-clear').click()
    assert.equal(await accountDialog().count(), 0)
    await field.click()
    await accountDialog().getByText(accounts[0].account, { exact: true }).waitFor()
    await selectAccount(accounts[0].account)
    await accountDialog()
      .getByRole('button', { name: /确定选择/, exact: true })
      .click()
    await accountDialog().waitFor({ state: 'hidden' })
  })
  await check('保存管理员只提交稳定 userId', async () => {
    await adminDialog.getByRole('button', { name: '保存管理员' }).click()
    await adminDialog.waitFor({ state: 'hidden' })
    assert.deepEqual(report.saves, [{ administratorUserId: accounts[0].userId }])
  })
  await check('企业开通复用同一账号弹窗并绑定创建用途', async () => {
    await page.getByRole('button', { name: /开通企业/ }).click()
    const createDialog = page.getByRole('dialog', { name: '开通企业', exact: true })
    await createDialog.getByLabel('首位企业管理员', { exact: true }).click()
    await accountDialog().getByText(accounts[0].account, { exact: true }).waitFor()
    assert.equal(report.queries.at(-1).purpose, 'createCompanyAdministrator')
    await accountDialog()
      .getByRole('button', { name: /取\s*消/, exact: true })
      .click()
    await createDialog.getByRole('button', { name: /取\s*消/, exact: true }).click()
    await createDialog.waitFor({ state: 'hidden' })
  })
  await check('390px 窄屏已选区固定高度且可自动滚动，确认按钮在视口内', async () => {
    await page.getByRole('button', { name: /开通企业/ }).click()
    const createDialog = page.getByRole('dialog', { name: '开通企业', exact: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await createDialog.getByLabel('首位企业管理员', { exact: true }).click()
    const dialog = accountDialog()
    await dialog.getByText(accounts[0].account, { exact: true }).waitFor()
    await selectAccount(accounts[0].account)
    await dialog.locator('[class*="selectionPanel"]').scrollIntoViewIfNeeded()
    await dialog.screenshot({ path: resolve(uiRoot, '账号选择器窄屏.png') })
    const bounds = await dialog.boundingBox()
    const button = await dialog.getByRole('button', { name: /确定选择/, exact: true }).boundingBox()
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390)
    assert(button.y >= 0 && button.y + button.height <= 844)
    const panelBounds = await dialog.locator('[class*="selectionPanel"]').boundingBox()
    assert.equal(panelBounds.height, 160)
    await dialog.getByRole('button', { name: /确定选择/, exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await createDialog.getByRole('button', { name: /取\s*消/, exact: true }).click()
  })
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.unexpectedApi, [])
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error.stack || String(error)
  process.exitCode = 1
} finally {
  await mkdir(outputRoot, { recursive: true })
  await writeFile(
    resolve(outputRoot, 'browser-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  )
  await browser.close()
  console.log(
    JSON.stringify({ passed: report.passed, checks: report.checks, failure: report.failure }),
  )
}
