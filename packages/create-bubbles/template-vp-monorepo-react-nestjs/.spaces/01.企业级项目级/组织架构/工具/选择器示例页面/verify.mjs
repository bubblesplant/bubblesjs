import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidence = resolve(root, '测试证据/选择器示例页面')
const ui = resolve(root, 'ui/选择器示例页面')
const baseUrl = process.argv.find((value) => /^https?:/.test(value)) || 'http://127.0.0.1:10000'
const report = { localCandidates: true, checks: [], pageErrors: [], unexpectedApi: [], outputs: {} }
const names = [
  'accountId',
  'memberId',
  'memberIds',
  'roleIds',
  'organizationIds',
  'organizationRelations',
  'positionIds',
]
const empty = {
  memberIds: [],
  roleIds: [],
  organizationIds: [],
  organizationRelations: [],
  positionIds: [],
}
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
page.setDefaultTimeout(12000)
page.on('pageerror', (error) => report.pageErrors.push(error.message))
await page.route(
  (url) => url.pathname.startsWith('/api/'),
  (route) => {
    report.unexpectedApi.push(route.request().url())
    return route.abort()
  },
)

/** 执行真实路由上的交互，并保留验收项。 */
async function check(name, action) {
  await action()
  report.checks.push(name)
  console.log(`PASS ${name}`)
}
/** 读取页面公开展示的表单 JSON。 */
async function current() {
  return JSON.parse(await page.getByTestId('selector-current').textContent())
}
/** 等待指定字段经过 React 更新后的真实显示值。 */
async function equals(name, expected) {
  await page.waitForFunction(
    ({ name, expected }) => {
      const node = document.querySelector('[data-testid="selector-current"]')
      return node && JSON.stringify(JSON.parse(node.textContent)[name]) === JSON.stringify(expected)
    },
    { name, expected },
  )
}
/** 打开受控字段的真实弹窗并等待动画结束。 */
async function open(name) {
  await page.locator(`#selector-example_${name}`).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await page.waitForTimeout(350)
  return dialog
}
/** 在弹窗内确认或取消本次草稿。 */
async function close(dialog, confirm = true) {
  await dialog.getByRole('button', { name: confirm ? /^(确\s*定|确定选择)$/ : /^取\s*消$/ }).click()
  await dialog.waitFor({ state: 'hidden' })
}
/** 根据候选行文案选中表格复选框或单选框。 */
async function choose(dialog, text) {
  const row = dialog.getByRole('row').filter({ hasText: text })
  const checkbox = row.getByRole('checkbox')
  if (await checkbox.count()) await checkbox.check()
  else await row.getByRole('radio').check()
}
/** 提交表单并保存结果区显示的实际快照。 */
async function submit() {
  await page.getByRole('button', { name: /提交表单$/ }).click()
  await page.getByRole('tab', { name: '最近提交结果', exact: true }).click()
  const output = page.getByTestId('selector-submitted')
  await output.waitFor()
  return JSON.parse(await output.textContent())
}

/** 等待应用转场和弹窗动画结束，保存稳定的可视证据。 */
async function capture(name) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: resolve(ui, name), fullPage: true, animations: 'disabled' })
}

try {
  await mkdir(evidence, { recursive: true })
  await mkdir(ui, { recursive: true })
  await check('未登录可通过公开路由直达七个 ProFormItem 字段', async () => {
    await page.goto(`${baseUrl}/examples/selector`)
    for (const name of names) await page.locator(`#selector-example_${name}`).waitFor()
    assert.equal(new URL(page.url()).pathname, '/examples/selector')
  })
  const initial = await current()
  await check('初始回显及纯组织／职责组织值类型正确', async () => {
    assert.equal(initial.accountId, 'demo-user-1')
    assert.equal(initial.memberId, 'demo-user-2')
    assert.deepEqual(initial.organizationIds, ['company-org-1'])
    assert.deepEqual(initial.organizationRelations, [
      { organizationUnitId: 'company-org-1', duty: 'leader' },
    ])
    assert.ok((await page.locator('body').innerText()).includes('演示成员甲'))
    await capture('desktop.png')
  })
  await check('基础导航可以往返国际化与选择器示例', async () => {
    await page.getByRole('menuitem', { name: '国际化示例' }).click()
    await page.waitForURL('**/examples/i18n')
    await page.getByRole('menuitem', { name: '选择器示例' }).click()
    await page.waitForURL('**/examples/selector')
    await page.locator('#selector-example_accountId').waitFor()
  })
  await check('页面提供 ProFormItem 接入代码及显式职责开关', async () => {
    await page.getByText('接入代码', { exact: true }).click()
    await page
      .getByText('<OrganizationSelect units={units} enableDuties />', { exact: false })
      .waitFor()
    await page.getByText('接入代码', { exact: true }).click()
  })
  await check('账号草稿取消不改值，确认后更新单值', async () => {
    let dialog = await open('accountId')
    await choose(dialog, '演示成员丙')
    await close(dialog, false)
    await equals('accountId', 'demo-user-1')
    dialog = await open('accountId')
    await choose(dialog, '演示成员丙')
    await close(dialog)
    await equals('accountId', 'demo-user-3')
  })
  await check('成员单选确认后更新 userId', async () => {
    const dialog = await open('memberId')
    await choose(dialog, '演示成员丁')
    await close(dialog)
    await equals('memberId', 'demo-user-4')
  })
  await check('成员多选确认后更新 ID 数组', async () => {
    const dialog = await open('memberIds')
    await choose(dialog, '演示成员丙')
    await close(dialog)
    await equals('memberIds', ['demo-user-1', 'demo-user-2', 'demo-user-3'])
  })
  await check('角色字段直接参与表单更新', async () => {
    const dialog = await open('roleIds')
    await choose(dialog, '业务审核员')
    await close(dialog)
    await equals('roleIds', ['company-role-1', 'company-role-2'])
  })
  await check('纯组织没有职责控件且只更新 string 数组', async () => {
    const dialog = await open('organizationIds')
    assert.equal(await dialog.getByRole('combobox').count(), 0)
    await choose(dialog, '演示企业 / 产品中心')
    await close(dialog)
    await equals('organizationIds', ['company-org-1', 'company-org-2'])
  })
  await check('开启职责后可修改职责，取消不污染已提交值', async () => {
    let dialog = await open('organizationRelations')
    await dialog
      .getByRole('row')
      .filter({ hasText: '演示企业 / 研发中心' })
      .locator('.ant-select')
      .click()
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('副负责人', { exact: true })
      .click()
    await close(dialog, false)
    await equals('organizationRelations', initial.organizationRelations)
    dialog = await open('organizationRelations')
    await dialog
      .getByRole('row')
      .filter({ hasText: '演示企业 / 研发中心' })
      .locator('.ant-select')
      .click()
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('副负责人', { exact: true })
      .click()
    await choose(dialog, '演示企业 / 产品中心')
    await capture('organization-duties.png')
    await close(dialog)
    await equals('organizationRelations', [
      { organizationUnitId: 'company-org-1', duty: 'deputy' },
      { organizationUnitId: 'company-org-2', duty: 'member' },
    ])
  })
  await check('岗位字段确认后更新岗位 ID 数组', async () => {
    const dialog = await open('positionIds')
    await choose(dialog, '产品经理')
    await close(dialog)
    await equals('positionIds', ['company-position-1', 'company-position-2'])
  })
  await check('有效提交的 JSON 与七个真实字段完全一致', async () => {
    const expected = await current()
    report.outputs.company = await submit()
    assert.deepEqual(report.outputs.company, expected)
  })
  await check('清空字段不会改变最近有效提交快照', async () => {
    await page.getByRole('button', { name: '清空字段', exact: true }).click()
    await equals('memberIds', [])
    assert.deepEqual(await current(), empty)
    assert.deepEqual(
      JSON.parse(await page.getByTestId('selector-submitted').textContent()),
      report.outputs.company,
    )
  })
  await check('全部清空后七项必填阻止提交并保留原快照', async () => {
    await page.getByRole('button', { name: /提交表单$/ }).click()
    await page.waitForFunction(
      () => document.querySelectorAll('.ant-form-item-explain-error').length === 7,
    )
    assert.deepEqual(
      JSON.parse(await page.getByTestId('selector-submitted').textContent()),
      report.outputs.company,
    )
  })
  await check('填入示例程序赋值恢复全部回显与校验状态', async () => {
    await page.getByRole('button', { name: '填入示例', exact: true }).click()
    await equals('accountId', initial.accountId)
    assert.deepEqual(await current(), initial)
    await page.waitForFunction(
      () => document.querySelectorAll('.ant-form-item-has-error').length === 0,
    )
  })
  await check('禁用时全部字段与四个表单按钮不可操作', async () => {
    await page.getByRole('switch', { name: '禁用表单' }).click()
    for (const name of names)
      assert.ok(await page.locator(`#selector-example_${name}`).isDisabled())
    for (const name of ['填入示例', '清空字段', '重置表单', '提交表单'])
      assert.ok(await page.getByRole('button', { name: new RegExp(`${name}$`) }).isDisabled())
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.getByRole('switch', { name: '禁用表单' }).click()
  })
  await check('重置恢复初值并清除提交快照', async () => {
    await page.getByRole('button', { name: '清空字段', exact: true }).click()
    await page.getByRole('button', { name: '重置表单', exact: true }).click()
    await equals('accountId', initial.accountId)
    assert.deepEqual(await current(), initial)
    await page.getByText('点击提交表单后查看结果', { exact: true }).waitFor()
  })
  await check('切换项目后使用项目候选与独立成员上下文', async () => {
    await page.getByText('项目级', { exact: true }).click()
    await equals('organizationIds', ['project-org-1'])
    assert.deepEqual((await current()).roleIds, ['project-role-1'])
    assert.deepEqual((await current()).positionIds, ['project-position-1'])
    const dialog = await open('memberId')
    assert.ok((await dialog.innerText()).includes('演示项目'))
    assert.ok(!(await dialog.innerText()).includes('演示企业'))
    await close(dialog, false)
  })
  await check('项目级职责组织与纯组织独立提交', async () => {
    const dialog = await open('organizationRelations')
    await choose(dialog, '演示项目 / 产品中心')
    await close(dialog)
    await equals('organizationRelations', [
      { organizationUnitId: 'project-org-1', duty: 'leader' },
      { organizationUnitId: 'project-org-2', duty: 'member' },
    ])
    report.outputs.project = await submit()
    assert.deepEqual(report.outputs.project, await current())
    assert.deepEqual(report.outputs.project.organizationIds, ['project-org-1'])
    await capture('submitted.png')
  })
  await check('重新切换企业时恢复企业初值并清除项目快照', async () => {
    await page.getByText('企业级', { exact: true }).click()
    await equals('organizationIds', initial.organizationIds)
    assert.deepEqual(await current(), initial)
    await page.getByRole('tab', { name: '最近提交结果', exact: true }).click()
    await page.getByText('点击提交表单后查看结果', { exact: true }).waitFor()
    await page.getByRole('tab', { name: '表单当前值', exact: true }).click()
  })
  await check('大量已选标签换行且容器内部 overflow:auto，字段不增高', async () => {
    const field = page
      .locator('#selector-example_organizationIds')
      .locator(
        'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]',
      )
    const before = (await field.boundingBox()).height
    const dialog = await open('organizationIds')
    await dialog.getByRole('checkbox').first().check()
    const items = dialog.locator('section[aria-label="已选组织"] > div').last()
    report.scroll = await items.evaluate((node) => ({
      overflow: getComputedStyle(node).overflow,
      height: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }))
    assert.equal(report.scroll.overflow, 'auto')
    assert.ok(report.scroll.scrollHeight > report.scroll.height)
    await capture('organization-scroll.png')
    await close(dialog)
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('[data-testid="selector-current"]').textContent)
          .organizationIds.length === 32,
    )
    assert.equal((await field.boundingBox()).height, before)
    report.fieldHeight = before
  })
  await check('390px 窄屏页面与弹窗没有横向溢出', async () => {
    await page.setViewportSize({ width: 390, height: 1000 })
    await page.waitForTimeout(400)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await capture('mobile.png')
    const dialog = await open('organizationIds')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    const box = await dialog.boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= 390)
    await capture('mobile-dialog.png')
    await close(dialog, false)
  })
  await check('浏览器没有运行时错误或业务 API 请求', async () => {
    assert.deepEqual(report.pageErrors, [])
    assert.deepEqual(report.unexpectedApi, [])
  })
} catch (error) {
  report.failure = String(error.stack ?? error)
  await page.screenshot({ path: resolve(ui, 'failure.png'), fullPage: true })
  throw error
} finally {
  await writeFile(resolve(evidence, 'browser.json'), JSON.stringify(report, null, 2))
  await writeFile(resolve(evidence, 'submitted.json'), JSON.stringify(report.outputs, null, 2))
  await browser.close()
}
