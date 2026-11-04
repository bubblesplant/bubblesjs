import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { base, install, scopes } from '../browser/fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = resolve(featureRoot, '../../..')
const catalog = await import(pathToFileURL(resolve(repoRoot, 'packages/shared/dist/utils.js')))
const baseUrl = process.argv[2] || 'http://127.0.0.1:9999'
const mode = process.argv[3] || 'verify'
assert(['baseline', 'verify'].includes(mode))
const report = { executedAt: new Date().toISOString(), mode, mockHttp: true, checks: [] }
await mkdir(resolve(featureRoot, 'ui/edit-form'), { recursive: true })
await mkdir(resolve(featureRoot, '测试证据/edit-form'), { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })

try {
  report.browserVersion = browser.version()
  const context = await browser.newContext({ viewport: { width: 1517, height: 1000 } })
  const state = await install({ context, baseUrl, catalog })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  /** 每次从页面直接打开编辑，首次操作不经过新增或预览。 */
  async function edit(name) {
    await page
      .getByRole('row')
      .filter({ hasText: name })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    await page.getByRole('dialog').waitFor()
  }

  /** 检查真实输入框的完整选项、只读值与排序，含停用项。 */
  async function expectItems(record) {
    const dialog = page.getByRole('dialog')
    const values = dialog.getByLabel('选项值', { exact: true })
    await values.first().waitFor()
    assert.equal(await values.count(), record.items.length)
    assert.equal(await dialog.getByLabel('字典编码', { exact: true }).inputValue(), record.code)
    for (const [index, item] of record.items.entries()) {
      assert.equal(await values.nth(index).inputValue(), item.value)
      assert(await values.nth(index).isDisabled())
      assert.equal(
        await dialog.getByLabel('显示名称', { exact: true }).nth(index).inputValue(),
        item.label,
      )
      assert.equal(
        await dialog.getByLabel('排序', { exact: true }).nth(index).inputValue(),
        String(item.sort),
      )
    }
  }

  /** 取消实际弹窗并等待销毁，后续操作重新初始化草稿。 */
  async function cancel() {
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /取.*消/ })
      .click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }

  for (const scope of scopes) {
    const first = state.records.get(scope.type)[0]
    first.code = 'nation'
    first.name = `${scope.type}民族`
    first.items = [
      { value: 'han', label: '汉族', sort: 0, status: 'active' },
      { value: 'other', label: '其他', sort: 5, status: 'disabled' },
    ]
    const second = {
      ...first,
      id: `${first.id.slice(0, -1)}${first.id.endsWith('0') ? '1' : '0'}`,
      code: 'units',
      name: `${scope.type}计量单位`,
      items: [{ value: 'm', label: '米', sort: 2, status: 'active' }],
    }
    state.records.get(scope.type).push(second)
    await page.goto(`${baseUrl}${base(scope)}/dictionaries`)
    await edit(first.name)
    report.firstEdit = await page
      .getByRole('dialog')
      .locator('input')
      .evaluateAll((inputs) =>
        inputs.map((input) => ({ id: input.id, value: input.value, disabled: input.disabled })),
      )
    await expectItems(first)
    report.checks.push(`${scope.type}: 首次直接编辑完整回填启用与停用项`)
    if (scope.type === 'platform') {
      await page.screenshot({
        path: resolve(featureRoot, `ui/edit-form/${mode}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
    await page.getByRole('dialog').getByRole('button', { name: '新增选项' }).click()
    await page.getByRole('dialog').getByLabel('选项值', { exact: true }).nth(2).fill('draft')
    await cancel()
    await edit(first.name)
    await expectItems(first)
    report.checks.push(`${scope.type}: 取消草稿后重开同一字典恢复保存内容`)
    await cancel()
    await edit(second.name)
    await expectItems(second)
    await cancel()
    await page.getByRole('button', { name: /新增字典/ }).click()
    const dialog = page.getByRole('dialog')
    assert.equal(await dialog.getByLabel('字典编码', { exact: true }).inputValue(), '')
    assert.equal(await dialog.getByLabel('字典名称', { exact: true }).inputValue(), '')
    assert.equal(await dialog.getByLabel('选项值', { exact: true }).count(), 0)
    await cancel()
    await edit(first.name)
    await expectItems(first)
    await dialog.getByLabel('字典名称', { exact: true }).fill(`${first.name}已验证`)
    const originalItems = structuredClone(first.items)
    const version = first.version
    await dialog.getByRole('button', { name: /确.*定/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(state.writes.at(-1).body.items, originalItems)
    assert.equal(state.writes.at(-1).body.expectedVersion, version)
    report.checks.push(`${scope.type}: 切换记录及新增不串数据，编辑保存提交完整选项和版本`)

    await page.getByRole('button', { name: /新增字典/ }).click()
    await dialog.getByLabel('字典编码', { exact: true }).fill(`empty_${scope.type}`)
    const emptyName = `${scope.type}空字典`
    await dialog.getByLabel('字典名称', { exact: true }).fill(emptyName)
    await dialog.getByRole('button', { name: /确.*定/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    await edit(emptyName)
    assert.equal(await dialog.getByLabel('选项值', { exact: true }).count(), 0)
    await dialog.getByRole('button', { name: '新增选项' }).click()
    await dialog.getByLabel('选项值', { exact: true }).fill('first')
    await dialog.getByLabel('显示名称', { exact: true }).fill('第一个选项')
    await dialog.getByRole('button', { name: /确.*定/ }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(state.writes.at(-1).body.items, [
      { value: 'first', label: '第一个选项', sort: 0, status: 'active' },
    ])
    await edit(emptyName)
    await expectItems(
      state.records.get(scope.type).find((item) => item.code === `empty_${scope.type}`),
    )
    await cancel()
    report.checks.push(`${scope.type}: 空字典编辑可新增选项、保存并在重开后完整显示`)
  }
  assert.deepEqual(state.unexpected, [])
  assert.deepEqual(pageErrors, [])
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = { name: error.name, message: error.message }
  process.exitCode = 1
} finally {
  await browser.close()
  await writeFile(
    resolve(featureRoot, `测试证据/edit-form/browser-${mode}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(JSON.stringify(report, null, 2))
}
