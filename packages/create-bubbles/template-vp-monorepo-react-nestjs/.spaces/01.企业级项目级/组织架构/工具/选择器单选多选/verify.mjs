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
const evidence = resolve(root, '测试证据/选择器单选多选')
const ui = resolve(root, 'ui/选择器单选多选')
const fields = [
  { name: 'accountIds', second: '演示成员乙', third: '演示成员丙', prefix: 'demo-user' },
  { name: 'memberIds', second: '演示成员乙', third: '演示成员丙', prefix: 'demo-user' },
  { name: 'roleIds', second: '业务审核员', third: '资料维护员', prefix: 'role' },
  { name: 'organizationIds', second: '产品中心', third: '设计中心', prefix: 'org' },
  { name: 'organizationRelations', second: '产品中心', third: '设计中心', prefix: 'org' },
  { name: 'positionIds', second: '产品经理', third: '交互设计师', prefix: 'position' },
]
const empty = Object.fromEntries(fields.map(({ name }) => [name, []]))
const report = { checks: [], outputs: {}, pageErrors: [], unexpectedApi: [] }
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

/** 执行验收并记录可追溯的成功项。 */
async function check(name, action) {
  await action()
  report.checks.push(name)
  console.log(`PASS ${name}`)
}
/** 等待字段的真实表单 JSON 更新。 */
async function equals(name, expected) {
  await page.waitForFunction(
    ({ name, expected }) => {
      const node = document.querySelector('[data-testid="selector-current"]')
      return node && JSON.stringify(JSON.parse(node.textContent)[name]) === JSON.stringify(expected)
    },
    { name, expected },
  )
}
/** 读取示例展示的完整表单值。 */
async function current() {
  return JSON.parse(await page.getByTestId('selector-current').textContent())
}
/** 打开当前字段并等待弹窗动画稳定。 */
async function open(name) {
  await page.locator(`#selector-example_${name}`).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await page.waitForTimeout(350)
  return dialog
}
/** 选择实际候选行，兼容单选和多选控件。 */
async function choose(dialog, text, multiple) {
  await dialog
    .getByRole('row')
    .filter({ hasText: text })
    .getByRole(multiple ? 'checkbox' : 'radio')
    .check()
}
/** 确认或取消草稿，等待弹窗消失。 */
async function close(dialog, confirm = true) {
  await dialog.getByRole('button', { name: confirm ? /^(确\s*定|确定选择)$/ : /^取\s*消$/ }).click()
  await dialog.waitFor({ state: 'hidden' })
}
/** 获取字段 Select 外壳，用于清空与高度检查。 */
function fieldRoot(name) {
  return page
    .locator(`#selector-example_${name}`)
    .locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]',
    )
}
/** 提交全部字段并读取实际确认输出。 */
async function submit() {
  await page.getByRole('button', { name: /提交表单$/ }).click()
  await page.getByRole('tab', { name: '最近提交结果', exact: true }).click()
  const output = page.getByTestId('selector-submitted')
  await output.waitFor()
  return JSON.parse(await output.textContent())
}

try {
  await mkdir(evidence, { recursive: true })
  await mkdir(ui, { recursive: true })
  await page.goto('http://127.0.0.1:10000/examples/selector')
  for (const { name } of fields) await page.locator(`#selector-example_${name}`).waitFor()

  for (const scope of ['company', 'project']) {
    await page.getByText(scope === 'company' ? '企业级' : '项目级', { exact: true }).click()
    for (const multiple of [false, true]) {
      await page.getByText(multiple ? '多选' : '单选', { exact: true }).click()
      await equals('memberIds', multiple ? ['demo-user-1', 'demo-user-2'] : ['demo-user-1'])
      await page.getByRole('tab', { name: '表单当前值', exact: true }).click()
      const initial = await current()
      for (const field of fields) {
        await check(
          `${scope}/${multiple ? '多选' : '单选'}/${field.name}：取消、替换或累加、回显与清空数组`,
          async () => {
            let dialog = await open(field.name)
            await choose(dialog, field.second, multiple)
            await close(dialog, false)
            await equals(field.name, initial[field.name])
            dialog = await open(field.name)
            assert.ok((await dialog.getByRole(multiple ? 'checkbox' : 'radio').count()) > 0)
            if (field.name === 'organizationIds')
              assert.equal(await dialog.getByRole('combobox').count(), 0)
            await choose(dialog, field.second, multiple)
            await choose(dialog, field.third, multiple)
            if (!multiple)
              assert.equal(
                await dialog
                  .getByRole('radio')
                  .evaluateAll((nodes) => nodes.filter((node) => node.checked).length),
                1,
              )
            await close(dialog)
            const prefix = field.prefix === 'demo-user' ? field.prefix : `${scope}-${field.prefix}`
            const ids = multiple ? [1, 2, 3] : [3]
            const expected = ids.map((index) =>
              field.name === 'organizationRelations'
                ? {
                    organizationUnitId: `${prefix}-${index}`,
                    duty: index === 1 ? 'leader' : 'member',
                  }
                : `${prefix}-${index}`,
            )
            await equals(field.name, expected)
            dialog = await open(field.name)
            assert.ok(
              await dialog
                .getByRole('row')
                .filter({ hasText: field.third })
                .getByRole(multiple ? 'checkbox' : 'radio')
                .isChecked(),
            )
            await close(dialog, false)
            const input = fieldRoot(field.name)
            await input.hover()
            await input.locator('.ant-select-clear').click()
            await equals(field.name, [])
          },
        )
      }
      await check(
        `${scope}/${multiple ? '多选' : '单选'}：程序赋值、必填、提交和重置`,
        async () => {
          assert.deepEqual(await current(), empty)
          await page.getByRole('button', { name: /提交表单$/ }).click()
          await page.waitForFunction(
            () => document.querySelectorAll('.ant-form-item-has-error').length === 6,
          )
          await page.getByRole('button', { name: '填入示例', exact: true }).click()
          await equals('accountIds', initial.accountIds)
          assert.deepEqual(await current(), initial)
          report.outputs[`${scope}-${multiple ? 'multiple' : 'single'}`] = await submit()
          assert.deepEqual(report.outputs[`${scope}-${multiple ? 'multiple' : 'single'}`], initial)
          assert.ok(Object.values(initial).every(Array.isArray))
          await page.getByRole('button', { name: '重置表单', exact: true }).click()
          await page.getByText('点击提交表单后查看结果', { exact: true }).waitFor()
          await page.getByRole('tab', { name: '表单当前值', exact: true }).click()
        },
      )
    }
  }

  for (const name of ['accountIds', 'memberIds', 'roleIds']) {
    await check(`${name}：跨页多选及禁选候选`, async () => {
      const initial = (await current())[name]
      const dialog = await open(name)
      await dialog.locator('.ant-pagination-next').click()
      const user = name !== 'roleIds'
      const index = user ? 21 : 11
      await choose(dialog, user ? `演示成员 ${index}` : `协作角色 ${index}`, true)
      const lastPage = dialog.locator('.ant-pagination-item').last()
      await lastPage.click()
      const disabledRow = dialog
        .getByRole('row')
        .filter({ hasText: user ? '演示成员 28' : '协作角色 24' })
      assert.ok(await disabledRow.getByRole('checkbox').isDisabled())
      await close(dialog)
      await equals(name, [...initial, user ? `demo-user-${index}` : `project-role-${index}`])
    })
  }
  await check('职责单选替换后保留独立职责数组，确认输出正确', async () => {
    await page.getByText('单选', { exact: true }).click()
    let dialog = await open('organizationRelations')
    await choose(dialog, '产品中心', false)
    await dialog.getByRole('row').filter({ hasText: '产品中心' }).locator('.ant-select').click()
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('副负责人', { exact: true })
      .click()
    await close(dialog)
    await equals('organizationRelations', [{ organizationUnitId: 'project-org-2', duty: 'deputy' }])
    assert.deepEqual((await current()).organizationIds, ['project-org-1'])
    report.outputs['single-with-duty'] = await submit()
    await page.waitForTimeout(500)
    await page.screenshot({
      path: resolve(ui, 'single-output.png'),
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByText('多选', { exact: true }).click()
    await page.getByRole('tab', { name: '最近提交结果', exact: true }).click()
    await page.getByText('点击提交表单后查看结果', { exact: true }).waitFor()
    await page.getByRole('tab', { name: '表单当前值', exact: true }).click()
  })
  await check('禁用时六字段和表单按钮不能操作', async () => {
    await page.getByRole('switch', { name: '禁用表单' }).click()
    for (const { name } of fields)
      assert.ok(await page.locator(`#selector-example_${name}`).isDisabled())
    for (const name of ['填入示例', '清空字段', '重置表单', '提交表单'])
      assert.ok(await page.getByRole('button', { name: new RegExp(`${name}$`) }).isDisabled())
    await page.getByRole('switch', { name: '禁用表单' }).click()
  })
  await check('32 项多选不增加入口高度，已选区 overflow:auto，390px 无横向溢出', async () => {
    const input = fieldRoot('organizationIds')
    const before = (await input.boundingBox()).height
    const dialog = await open('organizationIds')
    await dialog.getByRole('checkbox').first().check()
    report.scroll = await dialog
      .locator('section[aria-label="已选组织"] > div')
      .last()
      .evaluate((node) => ({
        overflow: getComputedStyle(node).overflow,
        height: node.clientHeight,
        scrollHeight: node.scrollHeight,
      }))
    assert.equal(report.scroll.overflow, 'auto')
    assert.ok(report.scroll.scrollHeight > report.scroll.height)
    await page.waitForTimeout(500)
    await page.screenshot({
      path: resolve(ui, 'multiple-scroll.png'),
      fullPage: true,
      animations: 'disabled',
    })
    await close(dialog)
    await page.waitForFunction(
      () =>
        JSON.parse(document.querySelector('[data-testid="selector-current"]').textContent)
          .organizationIds.length === 32,
    )
    report.fieldHeight = (await input.boundingBox()).height
    assert.equal(report.fieldHeight, before)
    await page.setViewportSize({ width: 390, height: 1000 })
    await page.waitForTimeout(400)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    const narrowDialog = await open('organizationIds')
    const box = await narrowDialog.boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= 390)
    await close(narrowDialog, false)
  })
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.unexpectedApi, [])
} catch (error) {
  report.failure = String(error.stack ?? error)
  await page.screenshot({ path: resolve(ui, 'failure.png'), fullPage: true })
  throw error
} finally {
  await writeFile(resolve(evidence, 'browser.json'), JSON.stringify(report, null, 2))
  await writeFile(resolve(evidence, 'submitted.json'), JSON.stringify(report.outputs, null, 2))
  await browser.close()
}
