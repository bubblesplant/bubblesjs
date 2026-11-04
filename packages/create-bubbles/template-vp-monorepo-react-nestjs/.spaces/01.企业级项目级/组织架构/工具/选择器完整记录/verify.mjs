import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const evidence = resolve(dirname(fileURLToPath(import.meta.url)), '../../测试证据/选择器完整记录')
const fields = [
  { name: 'accountIds', collection: 'accounts', second: '演示成员乙', third: '演示成员丙' },
  { name: 'memberIds', collection: 'members', second: '演示成员乙', third: '演示成员丙' },
  { name: 'roleIds', collection: 'roles', second: '业务审核员', third: '资料维护员' },
  { name: 'organizationIds', collection: 'units', second: '产品中心', third: '设计中心' },
  { name: 'organizationRelations', collection: 'units', second: '产品中心', third: '设计中心' },
  { name: 'positionIds', collection: 'positions', second: '产品经理', third: '交互设计师' },
]
const report = { checks: [], callbacks: {}, submissions: {}, pageErrors: [], unexpectedApi: [] }
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

/** 执行可复验的真实交互并记录结果。 */
async function check(name, action) {
  await action()
  report.checks.push(name)
  console.log(`PASS ${name}`)
}
/** 读取实际页面输出，允许当前值面板处于隐藏状态。 */
async function read(testId) {
  return JSON.parse(await page.getByTestId(testId).textContent())
}
/** 打开真实回调面板，不通过表单值推算记录。 */
async function callbacks() {
  await page.getByRole('tab', { name: '选择回调', exact: true }).click()
  return read('selector-records')
}
/** 等待表单当前值更新到期望的数组。 */
async function equals(name, expected) {
  await page.waitForFunction(
    ({ name, expected }) => {
      const node = document.querySelector('[data-testid="selector-current"]')
      return node && JSON.stringify(JSON.parse(node.textContent)[name]) === JSON.stringify(expected)
    },
    { name, expected },
  )
}
/** 取得字段外壳，定位清空与标签移除入口。 */
function fieldRoot(name) {
  return page
    .locator(`#selector-example_${name}`)
    .locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]',
    )
}
/** 打开公共字段的真实弹窗并等待门户出现。 */
async function open(name) {
  await page.locator(`#selector-example_${name}`).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await page.waitForTimeout(250)
  return dialog
}
/** 按候选内容操作真实选择控件。 */
async function choose(dialog, text, multiple, checked = true) {
  await dialog
    .getByRole('row')
    .filter({ hasText: text })
    .getByRole(multiple ? 'checkbox' : 'radio')
    .setChecked(checked)
}
/** 点击确认或取消并等待弹窗关闭。 */
async function close(dialog, confirm = true) {
  await dialog.getByRole('button', { name: confirm ? /^(确\s*定|确定选择)$/ : /^取\s*消$/ }).click()
  await dialog.waitFor({ state: 'hidden' })
}
/** 与完整候选逐字段比对，校验去重、顺序及职责分离。 */
function verifyRecords(change, expectedValues, candidates) {
  assert.deepEqual(change.values, expectedValues)
  const ids = expectedValues.map((value) =>
    typeof value === 'string' ? value : value.organizationUnitId,
  )
  const expected = ids.map((id) => candidates.find((record) => (record.userId ?? record.id) === id))
  assert.ok(expected.every(Boolean))
  assert.deepEqual(change.records, expected)
}
/** 通过字段原生清空按钮同步清除两个回调参数。 */
async function clear(name) {
  const field = fieldRoot(name)
  await field.hover()
  await field.locator('.ant-select-clear').click()
  await equals(name, [])
  assert.deepEqual((await callbacks())[name], { values: [], records: [] })
}

try {
  await mkdir(evidence, { recursive: true })
  await page.goto('http://127.0.0.1:10000/examples/selector')
  for (const { name } of fields) await page.locator(`#selector-example_${name}`).waitFor()
  for (const scope of ['company', 'project']) {
    await page.getByText(scope === 'company' ? '企业级' : '项目级', { exact: true }).click()
    const data = await page.evaluate(async (scope) => {
      const { createSelectorExampleData } =
        await import('/src/pages/examples/selector/config/data.ts')
      return createSelectorExampleData(scope)
    }, scope)
    for (const multiple of [false, true]) {
      const context = `${scope}/${multiple ? '多选' : '单选'}`
      await page.getByText(multiple ? '多选' : '单选', { exact: true }).click()
      await equals('memberIds', multiple ? ['demo-user-1', 'demo-user-2'] : ['demo-user-1'])
      const initial = await read('selector-current')
      await check(`${context}：初始补查与模式切换不制造回调`, async () => {
        await page.waitForFunction(
          () => !document.querySelector('.ant-select')?.textContent?.includes('账号信息不可用'),
        )
        assert.deepEqual(await callbacks(), {})
      })
      for (const field of fields) {
        await check(`${context}/${field.name}：取消、完整记录、选择顺序、移除与清空`, async () => {
          const before = await callbacks()
          let dialog = await open(field.name)
          await choose(dialog, field.third, multiple)
          await close(dialog, false)
          await equals(field.name, initial[field.name])
          assert.deepEqual(await callbacks(), before)
          dialog = await open(field.name)
          if (multiple && field.name === 'memberIds')
            await choose(dialog, field.second, true, false)
          await choose(dialog, field.third, multiple)
          await choose(dialog, field.second, multiple)
          await close(dialog)
          const firstId =
            field.collection === 'accounts' || field.collection === 'members'
              ? 'demo-user-1'
              : `${scope}-${field.collection === 'roles' ? 'role' : field.collection === 'units' ? 'org' : 'position'}-1`
          const ids = (multiple ? [1, 3, 2] : [2]).map((index) =>
            firstId.replace(/1$/, String(index)),
          )
          const expected = ids.map((id) =>
            field.name === 'organizationRelations'
              ? { organizationUnitId: id, duty: id === firstId ? 'leader' : 'member' }
              : id,
          )
          await equals(field.name, expected)
          let change = (await callbacks())[field.name]
          verifyRecords(change, expected, data[field.collection])
          report.callbacks[`${context}/${field.name}`] = change
          dialog = await open(field.name)
          await close(dialog, false)
          assert.deepEqual((await callbacks())[field.name], change)
          if (multiple) {
            const remove = fieldRoot(field.name).locator(
              '.ant-select-content-item:not([aria-hidden="true"]) .ant-select-selection-item-remove',
            )
            if (await remove.count()) await remove.first().click()
            else {
              dialog = await open(field.name)
              await choose(dialog, data[field.collection][0].name, true, false)
              await close(dialog)
            }
            await equals(field.name, expected.slice(1))
            change = (await callbacks())[field.name]
            verifyRecords(change, expected.slice(1), data[field.collection])
          }
          await clear(field.name)
        })
      }
      await check(`${context}：赋值、提交、清空字段及重置保留表单值协议`, async () => {
        await page.getByRole('button', { name: '填入示例', exact: true }).click()
        await equals('accountIds', initial.accountIds)
        assert.deepEqual(await callbacks(), {})
        assert.deepEqual(await read('selector-current'), initial)
        await page.getByRole('button', { name: /提交表单$/ }).click()
        await page.getByRole('tab', { name: '最近提交结果', exact: true }).click()
        await page.getByTestId('selector-submitted').waitFor()
        const submitted = await read('selector-submitted')
        assert.deepEqual(submitted, initial)
        report.submissions[context] = submitted
        const dialog = await open('roleIds')
        await close(dialog)
        assert.ok((await callbacks()).roleIds)
        await page.getByRole('button', { name: '清空字段', exact: true }).click()
        await equals('roleIds', [])
        assert.deepEqual(await callbacks(), {})
        await page.getByRole('button', { name: '重置表单', exact: true }).click()
        await equals('roleIds', initial.roleIds)
        assert.deepEqual(await callbacks(), {})
        assert.equal(await page.getByTestId('selector-submitted').count(), 0)
      })
    }
  }
  for (const field of fields.filter((field) =>
    ['accountIds', 'memberIds', 'roleIds'].includes(field.name),
  )) {
    await check(`${field.name}：跨页完整记录与既有选中顺序`, async () => {
      const initial = (await read('selector-current'))[field.name]
      const dialog = await open(field.name)
      await dialog.locator('.ant-pagination-next').click()
      const index = field.name === 'roleIds' ? 11 : 21
      await choose(
        dialog,
        field.name === 'roleIds' ? `协作角色 ${index}` : `演示成员 ${index}`,
        true,
      )
      await close(dialog)
      const data = await page.evaluate(async () =>
        (await import('/src/pages/examples/selector/config/data.ts')).createSelectorExampleData(
          'project',
        ),
      )
      const expected = [
        ...initial,
        field.name === 'roleIds' ? `project-role-${index}` : `demo-user-${index}`,
      ]
      verifyRecords((await callbacks())[field.name], expected, data[field.collection])
      report.callbacks[`跨页/${field.name}`] = (await callbacks())[field.name]
    })
  }
  await check('职责变更通过第一参数关联组织完整记录，纯组织字段独立', async () => {
    const before = (await read('selector-current')).organizationIds
    const dialog = await open('organizationRelations')
    const row = dialog.getByRole('row').filter({ hasText: '研发中心' })
    await row.locator('.ant-select').click()
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('副负责人', { exact: true })
      .click()
    await close(dialog)
    const change = (await callbacks()).organizationRelations
    assert.deepEqual(change.values, [{ organizationUnitId: 'project-org-1', duty: 'deputy' }])
    assert.equal(change.records[0].id, 'project-org-1')
    assert.ok(!('duty' in change.records[0]))
    assert.deepEqual((await read('selector-current')).organizationIds, before)
    report.callbacks['职责变更'] = change
  })
  await check('禁用六字段不产生回调或打开弹窗', async () => {
    const before = await callbacks()
    await page.getByRole('switch', { name: '禁用表单' }).click()
    for (const { name } of fields)
      assert.ok(await page.locator(`#selector-example_${name}`).isDisabled())
    assert.deepEqual(await callbacks(), before)
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.getByRole('switch', { name: '禁用表单' }).click()
  })
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.unexpectedApi, [])
} catch (error) {
  report.failure = String(error.stack ?? error)
  throw error
} finally {
  await writeFile(resolve(evidence, 'browser.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
