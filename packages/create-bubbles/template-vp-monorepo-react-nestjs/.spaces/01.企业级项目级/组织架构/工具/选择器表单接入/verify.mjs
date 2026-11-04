import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from './mount.mjs'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidence = resolve(root, '测试证据/选择器表单接入')
const ui = resolve(root, 'ui/选择器表单接入')
const baseUrl = process.argv.find((value) => /^https?:/.test(value)) || 'http://127.0.0.1:10000'
const report = { mockData: true, checks: [], pageErrors: [], unexpectedApi: [], outputs: {} }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 1050 } })
page.setDefaultTimeout(12000)
page.on('pageerror', (error) => report.pageErrors.push(error.message))
await page.route('**/api/**', (route) => {
  report.unexpectedApi.push(route.request().url())
  return route.abort()
})

/** 执行真实字段验收并记录结果。 */
async function check(name, action) {
  await action()
  report.checks.push(name)
}
/** 读取表单原始字段，避免从截断标签反推值。 */
async function value(name) {
  return page.evaluate((name) => window.__formQA.form.getFieldValue(name), name)
}
/** 等待 React 更新后比较表单字段的实际值。 */
async function equals(name, expected) {
  await page.waitForFunction(
    ({ name, expected }) =>
      JSON.stringify(window.__formQA.form.getFieldValue(name)) === JSON.stringify(expected),
    { name, expected },
  )
}
/** 通过真实受控入口打开弹窗，并等待进入动画结束。 */
async function open(name, keyboard = false) {
  const input = page.locator(`#selector-demo_${name}`)
  if (keyboard) {
    await input.focus()
    await input.press('ArrowDown')
  } else await input.click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await page.waitForTimeout(350)
  return dialog
}
/** 确认或取消当前选择会话。 */
async function close(dialog, confirm) {
  await dialog.getByRole('button', { name: confirm ? /^(确\s*定|确定选择)$/ : /^取\s*消$/ }).click()
  await dialog.waitFor({ state: 'hidden' })
}
/** 通过真实字段清空按钮更新表单，同时断言清空不会误开弹窗。 */
async function clear(name, expected) {
  const field = page
    .locator(`#selector-demo_${name}`)
    .locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]',
    )
  await field.hover()
  await field.getByRole('button', { name: 'Clear', exact: true }).click()
  await equals(name, expected)
  assert.equal(await page.getByRole('dialog').count(), 0)
}

try {
  await mkdir(evidence, { recursive: true })
  await mkdir(ui, { recursive: true })
  const html = (await (await fetch(baseUrl + '/')).text()).replace(
    /<script type="module" src="\/src\/main\.tsx[^"]*"><\/script>/,
    '',
  )
  await page.route('**/__selector_form_qa__', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.goto(baseUrl + '/__selector_form_qa__')
  await page.evaluate(mount)
  const names = [
    'accountId',
    'memberIds',
    'roleIds',
    'organizationIds',
    'organizationRelations',
    'positionIds',
    'memberId',
    'otherOrganizationIds',
  ]
  await check(
    '八个 ProFormItem 接收 initialValues，字段 id 与原始值一致，账号／成员按 ID 补查回显',
    async () => {
      const initial = await page.evaluate(() => window.__formQA.initial)
      for (const name of names) {
        await equals(name, initial[name])
        assert.equal(await page.locator(`#selector-demo_${name}`).count(), 1)
      }
      await page.getByText('演示成员甲 · demo.1@example.invalid', { exact: true }).first().waitFor()
      assert.equal(await page.evaluate(() => window.__formQA.changes.length), 0)
    },
  )
  await check('组织取消丢弃草稿，重新打开以表单值回显；确认纯组织 ID，不影响独立字段', async () => {
    let dialog = await open('organizationIds')
    assert.equal(await dialog.getByText('职责', { exact: true }).count(), 0)
    const row = dialog.getByRole('row').filter({ hasText: '产品中心' })
    await row.getByRole('checkbox').check()
    await close(dialog, false)
    await equals('organizationIds', ['org-1'])
    dialog = await open('organizationIds')
    assert.equal(
      await dialog
        .getByRole('row')
        .filter({ hasText: '产品中心' })
        .getByRole('checkbox')
        .isChecked(),
      false,
    )
    await dialog.getByRole('row').filter({ hasText: '产品中心' }).getByRole('checkbox').check()
    await close(dialog, true)
    await equals('organizationIds', ['org-1', 'org-2'])
    await equals('otherOrganizationIds', ['org-3'])
  })
  await check('职责开启时完整回显，确认结构化关系，新加入组织默认成员', async () => {
    const dialog = await open('organizationRelations')
    const row = dialog.getByRole('row').filter({ hasText: '研发中心' })
    assert((await row.innerText()).includes('负责人'))
    await row.getByRole('combobox').click()
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('副负责人', { exact: true })
      .click()
    await dialog.getByRole('row').filter({ hasText: '产品中心' }).getByRole('checkbox').check()
    await dialog.locator('.ant-modal-title').click()
    await page.waitForTimeout(350)
    await dialog.screenshot({ path: resolve(ui, '组织职责表单选择.png') })
    await close(dialog, true)
    await equals('organizationRelations', [
      { organizationUnitId: 'org-1', duty: 'deputy' },
      { organizationUnitId: 'org-2', duty: 'member' },
    ])
  })
  await check('岗位默认禁选停用项，取消不变，确认后回填稳定 ID', async () => {
    let dialog = await open('positionIds')
    assert(
      await dialog
        .getByRole('row')
        .filter({ hasText: 'DEMO-36' })
        .getByRole('checkbox')
        .isDisabled(),
    )
    await dialog.getByRole('row').filter({ hasText: '产品经理' }).getByRole('checkbox').check()
    await close(dialog, false)
    await equals('positionIds', ['pos-1'])
    dialog = await open('positionIds')
    await dialog.getByRole('row').filter({ hasText: '产品经理' }).getByRole('checkbox').check()
    await close(dialog, true)
    await equals('positionIds', ['pos-1', 'pos-2'])
  })
  await check('角色保留既有受限角色资格，禁止新增受限角色，取消与确认遵循表单协议', async () => {
    let dialog = await open('roleIds')
    assert(
      await dialog
        .getByRole('row')
        .filter({ hasText: '禁止新增角色' })
        .getByRole('checkbox')
        .isDisabled(),
    )
    const original = dialog
      .getByRole('row')
      .filter({ hasText: '历史受限角色' })
      .getByRole('checkbox')
    await original.uncheck()
    await original.check()
    await dialog.getByRole('row').filter({ hasText: '业务审核员' }).getByRole('checkbox').check()
    await close(dialog, false)
    await equals('roleIds', ['role-1', 'role-3'])
    dialog = await open('roleIds')
    await dialog.getByRole('row').filter({ hasText: '业务审核员' }).getByRole('checkbox').check()
    await close(dialog, true)
    await equals('roleIds', ['role-1', 'role-3', 'role-2'])
  })
  for (const [name, control] of [
    ['accountId', 'radio'],
    ['memberIds', 'checkbox'],
    ['memberId', 'radio'],
  ]) {
    await check(`${name} 取消不改值，确认回填 userId，禁选候选不能新增`, async () => {
      const before = await value(name)
      let dialog = await open(name)
      assert(
        await dialog
          .getByRole('row')
          .filter({ hasText: 'demo.6@example.invalid' })
          .getByRole(control)
          .isDisabled(),
      )
      await dialog.getByRole('row').filter({ hasText: '演示成员乙' }).getByRole(control).check()
      await close(dialog, false)
      await equals(name, before)
      dialog = await open(name)
      await dialog.getByRole('row').filter({ hasText: '演示成员乙' }).getByRole(control).check()
      await close(dialog, true)
      await equals(name, name === 'memberIds' ? ['user-1', 'user-2'] : 'user-2')
    })
  }
  await check('真实点击提交输出稳定值，职责开关两种协议不混用', async () => {
    await page.getByRole('button', { name: '提交表单' }).click()
    await page.waitForFunction(() => window.__formQA.submissions.length === 1)
    const output = await page.evaluate(() => window.__formQA.submissions[0])
    assert.deepEqual(output.organizationIds, ['org-1', 'org-2'])
    assert.deepEqual(output.organizationRelations, [
      { organizationUnitId: 'org-1', duty: 'deputy' },
      { organizationUnitId: 'org-2', duty: 'member' },
    ])
    assert.deepEqual(output.positionIds, ['pos-1', 'pos-2'])
    assert.deepEqual(output.roleIds, ['role-1', 'role-3', 'role-2'])
    report.outputs.submitted = output
    await writeFile(resolve(evidence, 'submitted.json'), JSON.stringify(output, null, 2))
    await page.screenshot({ path: resolve(ui, '统一表单字段.png'), fullPage: true })
  })
  for (const name of names) {
    await check(`${name} 字段清空即时更新，不误开弹窗`, async () => {
      await clear(name, name === 'accountId' || name === 'memberId' ? undefined : [])
    })
  }
  await check('必填校验由 ProFormItem 执行，空字段阻止提交', async () => {
    await page.getByRole('button', { name: '提交表单' }).click()
    await page.getByText('请选择账号', { exact: true }).waitFor()
    assert.equal(await page.locator('.ant-form-item-has-error').count(), 8)
    assert.equal(await page.evaluate(() => window.__formQA.submissions.length), 1)
  })
  await check('resetFields 恢复全部初始值与回显，并清除校验错误', async () => {
    await page.getByRole('button', { name: '重置表单' }).click()
    const initial = await page.evaluate(() => window.__formQA.initial)
    for (const name of names) await equals(name, initial[name])
    await page.waitForFunction(() => !document.querySelector('.ant-form-item-has-error'))
    const dialog = await open('organizationRelations')
    assert(
      (await dialog.getByRole('row').filter({ hasText: '研发中心' }).innerText()).includes(
        '负责人',
      ),
    )
    await close(dialog, false)
  })
  await check('setFieldsValue 后各字段显示最新值，打开草稿读取程序赋值', async () => {
    await page.evaluate(() =>
      window.__formQA.form.setFieldsValue({
        accountId: 'user-3',
        memberIds: ['user-3'],
        roleIds: ['role-2'],
        organizationIds: ['org-3'],
        organizationRelations: [{ organizationUnitId: 'org-3', duty: 'leader' }],
        positionIds: ['pos-3'],
      }),
    )
    await equals('organizationIds', ['org-3'])
    const dialog = await open('organizationIds', true)
    assert(
      await dialog
        .getByRole('row')
        .filter({ hasText: '设计中心' })
        .getByRole('checkbox')
        .isChecked(),
    )
    assert.equal(
      await dialog
        .getByRole('row')
        .filter({ hasText: '研发中心' })
        .getByRole('checkbox')
        .isChecked(),
      false,
    )
    await close(dialog, false)
    await page.getByText('演示成员丙 · demo.3@example.invalid', { exact: true }).first().waitFor()
  })
  await check('禁用字段阻止鼠标／键盘打开及清空，表单值保持不变', async () => {
    const before = await page.evaluate(() => window.__formQA.form.getFieldsValue())
    await page.evaluate(() => window.__formQA.setDisabled(true))
    for (const name of names) {
      const input = page.locator(`#selector-demo_${name}`)
      assert(await input.isDisabled())
      await input.click({ force: true })
    }
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.deepEqual(await page.evaluate(() => window.__formQA.form.getFieldsValue()), before)
    await page.evaluate(() => window.__formQA.setDisabled(false))
  })
  await check('异步候选尚未到达时保留 ID，到达后自动回显名称', async () => {
    await page.evaluate(() => window.__formQA.setLoaded(false))
    assert.deepEqual(await value('organizationIds'), ['org-3'])
    assert.deepEqual(await value('positionIds'), ['pos-3'])
    assert.deepEqual(await value('roleIds'), ['role-2'])
    await page.evaluate(() => window.__formQA.setLoaded(true))
    await page.getByText('交互设计师 · DEMO-3', { exact: true }).first().waitFor()
  })
  await check('多选入口大量值保持单行，弹窗已选区滚动且不推动表格', async () => {
    const field = page
      .locator('#selector-demo_organizationIds')
      .locator(
        'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]',
      )
    const before = await field.boundingBox()
    await page.evaluate(() =>
      window.__formQA.form.setFieldValue(
        'organizationIds',
        window.__formQA.units.map((row) => row.id),
      ),
    )
    await equals(
      'organizationIds',
      Array.from({ length: 36 }, (_, i) => `org-${i + 1}`),
    )
    await page.waitForTimeout(350)
    const after = await field.boundingBox()
    assert(Math.abs(before.height - after.height) < 1)
    const dialog = await open('organizationIds')
    const list = dialog.locator('[class*="selectedItems"]')
    const scroll = await list.evaluate((el) => ({
      overflow: getComputedStyle(el).overflow,
      client: el.clientHeight,
      total: el.scrollHeight,
    }))
    assert.equal(scroll.overflow, 'auto')
    assert(scroll.total > scroll.client)
    report.layout = { before, after, scroll }
    await dialog.screenshot({ path: resolve(ui, '组织字段已选滚动.png') })
    await close(dialog, false)
  })
  await check('390px 窄屏字段无横向溢出，仍可打开和取消组织选择', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(350)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    const dialog = await open('organizationIds')
    const box = await dialog.boundingBox()
    assert(box.x >= 0 && box.x + box.width <= 390)
    await dialog.screenshot({ path: resolve(ui, '组织表单窄屏.png') })
    await close(dialog, false)
  })
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.unexpectedApi, [])
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error.stack
  report.accessibility = await page.locator('body').ariaSnapshot()
  await page.screenshot({ path: resolve(evidence, 'failure.png'), fullPage: true })
  process.exitCode = 1
} finally {
  await writeFile(resolve(evidence, 'browser.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
