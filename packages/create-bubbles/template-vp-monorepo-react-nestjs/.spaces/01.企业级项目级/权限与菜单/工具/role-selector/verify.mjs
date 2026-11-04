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
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidenceRoot = resolve(featureRoot, '测试证据/role-selector')
const uiRoot = resolve(featureRoot, 'ui/role-selector')
const layoutUiRoot = resolve(featureRoot, 'ui/selector-layout')
const baseUrl = process.argv.find((value) => /^https?:/.test(value)) || 'http://127.0.0.1:10000'
const report = { baseUrl, mockApi: true, checks: [], pageErrors: [], unexpectedApi: [], saves: [] }
const browser = await chromium.launch({ channel: 'msedge', headless: true })
report.browserVersion = browser.version()
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await context.newPage()
page.on('pageerror', (error) => report.pageErrors.push(error.message))
const scopePaths = {
  company: '/companies/qa-company',
  project: '/companies/qa-company/projects/qa-project',
  platform: '/platform',
}
const date = '2026-11-03T00:00:00.000Z'
const roleIdsByScope = new Map(
  Object.keys(scopePaths).map((scope) => [scope, ['role-0', 'role-1']]),
)
let failSave = false

/** 生成不含真实业务信息的角色列表，覆盖内置、禁选及分页。 */
function rolesFor(scope) {
  return Array.from({ length: 44 }, (_, index) => ({
    id: `role-${index}`,
    scope:
      scope === 'platform'
        ? { type: scope }
        : {
            type: scope,
            companyId: 'qa-company',
            ...(scope === 'project' ? { projectId: 'qa-project' } : {}),
          },
    name:
      index === 0
        ? '内置普通成员'
        : index === 1
          ? '原有受限角色'
          : index === 2
            ? '不可分配角色'
            : index >= 5 && index <= 9
              ? ['审阅', '统计', '成员', '归档', '巡检'][index - 5]
              : index >= 14
                ? `长名称角色 ${index} ${'角色名称换行验证'.repeat(8)}`
                : `自定义角色 ${index}`,
    description: index === 0 ? '提供当前空间的基础访问权限' : '用于角色选择器交互验证的虚构角色',
    builtin: index === 0 ? 'member' : null,
    assignable: index !== 1 && index !== 2,
    permissionKeys: [],
    memberCount: 0,
    version: 1,
    createdAt: date,
    updatedAt: date,
  }))
}

/** 构造平台账号或空间成员，保存后从同一模拟状态回读角色。 */
function membersFor(scope) {
  return ['a', 'b'].map((suffix) => {
    const roleIds = suffix === 'a' ? roleIdsByScope.get(scope) : ['role-4']
    const record = {
      id: `member-${suffix}`,
      userId: `user-${suffix}`,
      name: suffix === 'a' ? '演示成员甲' : '演示成员乙',
      account: `demo.${suffix}@example.invalid`,
      status: 'active',
      accountStatus: 'active',
      roleIds,
      roleNames: rolesFor(scope)
        .filter((role) => roleIds.includes(role.id))
        .map((role) => role.name),
      version: 3,
      createdAt: date,
      updatedAt: date,
    }
    return scope === 'platform' ? { ...record, platformRoleIds: roleIds } : record
  })
}

await context.route(
  (url) => url.pathname.startsWith('/api/'),
  async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.slice(4)
    if (path === '/auth/me') return route.fulfill({ json: user })
    if (path === '/auth/login')
      return route.fulfill({
        json: {
          user,
          accessToken: 'qa-fake-role-selector-token',
          absoluteExpiresAt: '2030-01-01T00:00:00.000Z',
        },
      })
    const scope = path.includes('/projects/')
      ? 'project'
      : path.startsWith('/platform')
        ? 'platform'
        : 'company'
    const scopePath = scopePaths[scope]
    const memberPath = `${scopePath}/${scope === 'platform' ? 'accounts' : 'members'}`
    if (request.method() === 'PUT' && path === `${memberPath}/member-a/roles`) {
      const payload = request.postDataJSON()
      report.saves.push({ scope, payload, failed: failSave })
      if (failSave)
        return route.fulfill({
          status: 409,
          json: { code: 'ACCESS.VERSION_CONFLICT', message: '演示版本冲突，请重试' },
        })
      roleIdsByScope.set(scope, payload.roleIds)
      return route.fulfill({ json: membersFor(scope)[0] })
    }
    if (request.method() === 'GET' && path === memberPath)
      return route.fulfill({ json: { items: membersFor(scope), total: 2, page: 1, pageSize: 20 } })
    if (request.method() === 'GET' && path === `${scopePath}/roles`)
      return route.fulfill({ json: { items: rolesFor(scope), total: 44, page: 1, pageSize: 100 } })
    const body = fixtureResponse(url, 'filled')
    if (body === undefined || request.method() !== 'GET') {
      report.unexpectedApi.push(`${request.method()} ${path}`)
      return route.fulfill({ status: 501, json: { message: '专项测试未配置的 API' } })
    }
    return route.fulfill({ json: body })
  },
)

/** 打开指定成员的角色表单，等待真实 React 和 AntD 弹窗可交互。 */
async function openAssignment(name = '演示成员甲') {
  await page
    .getByRole('row')
    .filter({ hasText: name })
    .getByRole('button', { name: /分配角色$/ })
    .click()
  const dialog = page.getByRole('dialog', { name: `分配角色 · ${name}`, exact: true })
  await dialog.waitFor()
  return dialog
}

/** 打开表格选择会话并等待首屏候选。 */
async function openSelector(assignment) {
  await assignment.getByRole('combobox', { name: '选择角色', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '选择角色', exact: true })
  await dialog.getByRole('row').filter({ hasText: '内置普通成员' }).waitFor()
  return dialog
}

/** 按角色名称获取表格中的真实复选框，避免选中顶部摘要标签。 */
function checkbox(dialog, name) {
  return dialog.getByRole('row').filter({ hasText: name }).getByRole('checkbox')
}

/** 关闭选择器并等待其销毁，确保后续操作只命中外层表单。 */
async function closeSelector(dialog, confirm) {
  await dialog.getByRole('button', { name: confirm ? /^确定选择$/ : /^取\s*消$/ }).click()
  await dialog.waitFor({ state: 'hidden' })
}

try {
  await mkdir(evidenceRoot, { recursive: true })
  await mkdir(uiRoot, { recursive: true })
  await page.goto(`${baseUrl}/login`)
  await page.getByLabel('账号', { exact: true }).fill('qa_role_selector')
  await page.getByLabel('密码', { exact: true }).fill('qa_role_selector_only')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await page.waitForURL('**/workspaces')
  await page.goto(`${baseUrl}${scopePaths.company}/members`)
  let assignment = await openAssignment()
  assert.equal(await assignment.locator('.ant-select').count(), 1)
  let selector = await openSelector(assignment)
  assert(await checkbox(selector, '内置普通成员').isChecked())
  assert(await checkbox(selector, '原有受限角色').isChecked())
  assert(await checkbox(selector, '不可分配角色').isDisabled())
  await checkbox(selector, '原有受限角色').uncheck()
  await checkbox(selector, '原有受限角色').check()
  report.checks.push(
    'ProFormItem 使用公共 Select 字段；已有角色回显；新增受限角色禁选，原有受限角色可撤销恢复',
  )

  await checkbox(selector, '自定义角色 3').check()
  await selector.getByTitle('下一页').click()
  await checkbox(selector, '自定义角色 11').check()
  await selector.getByPlaceholder('搜索角色名称').fill('自定义角色 11')
  await selector.getByRole('button', { name: /^查\s*询$/ }).click()
  await selector.getByRole('row').filter({ hasText: '自定义角色 11' }).waitFor()
  assert(await checkbox(selector, '自定义角色 11').isChecked())
  assert(await selector.getByLabel('已选择 4 项', { exact: true }).isVisible())
  report.checks.push('跨页选择及搜索后保留完整选择集合')
  await closeSelector(selector, false)
  assert.equal(
    await assignment
      .locator(
        '.ant-select-content-item:not(.ant-select-content-item-rest) .ant-select-selection-item[title]',
      )
      .count(),
    2,
  )
  assert.equal(report.saves.length, 0)
  report.checks.push('取消选择器不更改外层表单，也不发送保存请求')

  selector = await openSelector(assignment)
  await checkbox(selector, '自定义角色 3').check()
  await selector.getByTitle('下一页').click()
  await checkbox(selector, '自定义角色 11').check()
  await selector.getByTitle('上一页').click()
  await selector.screenshot({ path: resolve(uiRoot, '角色表格选择器.png') })
  await closeSelector(selector, true)
  assert.equal(
    await assignment
      .locator(
        '.ant-select-content-item:not(.ant-select-content-item-rest) .ant-select-selection-item[title]',
      )
      .count(),
    4,
  )
  assert.equal(report.saves.length, 0)
  await assignment.screenshot({ path: resolve(uiRoot, '分配角色回填.png') })
  failSave = true
  await assignment.getByRole('button', { name: /保存角色$/ }).click()
  await page.getByText(/^演示版本冲突，请重试/).waitFor()
  assert(await assignment.isVisible())
  assert.equal(
    await assignment
      .locator(
        '.ant-select-content-item:not(.ant-select-content-item-rest) .ant-select-selection-item[title]',
      )
      .count(),
    4,
  )
  await assignment.locator('button.ant-btn-loading').waitFor({ state: 'hidden' })
  report.checks.push('确认只回填表单；保存失败保留已选角色')
  failSave = false
  await assignment.getByRole('button', { name: /保存角色$/ }).click()
  await assignment.waitFor({ state: 'hidden' })
  assert.deepEqual(report.saves.at(-1).payload, {
    roleIds: ['role-0', 'role-1', 'role-3', 'role-11'],
    expectedVersion: 3,
  })
  report.checks.push('外层保存提交稳定角色 ID 和原版本')

  assignment = await openAssignment()
  selector = await openSelector(assignment)
  await selector.getByRole('button', { name: '清空选择', exact: true }).click()
  await closeSelector(selector, true)
  assert.equal(
    await assignment
      .locator(
        '.ant-select-content-item:not(.ant-select-content-item-rest) .ant-select-selection-item[title]',
      )
      .count(),
    0,
  )
  await assignment.getByRole('button', { name: /^取\s*消$/ }).click()
  await assignment.waitFor({ state: 'hidden' })
  assignment = await openAssignment()
  assert.equal(
    await assignment
      .locator(
        '.ant-select-content-item:not(.ant-select-content-item-rest) .ant-select-selection-item[title]',
      )
      .count(),
    4,
  )
  selector = await openSelector(assignment)
  await selector.getByRole('button', { name: '清空选择', exact: true }).click()
  await closeSelector(selector, true)
  await assignment.getByRole('button', { name: /保存角色$/ }).click()
  await assignment.waitFor({ state: 'hidden' })
  assert.deepEqual(report.saves.at(-1).payload.roleIds, [])
  report.checks.push('取消外层丢弃草稿；重新打开恢复记录；清空后保存空角色集合')

  assignment = await openAssignment('演示成员乙')
  assert.equal(
    await assignment
      .locator(
        '.ant-select-content-item:not(.ant-select-content-item-rest) .ant-select-selection-item[title]',
      )
      .count(),
    1,
  )
  assert((await assignment.innerText()).includes('自定义角色 4'))
  await assignment.getByRole('button', { name: /^取\s*消$/ }).click()
  await assignment.waitFor({ state: 'hidden' })
  report.checks.push('切换成员不串入上个成员的选择')

  for (const scope of ['platform', 'project']) {
    await page.goto(
      `${baseUrl}${scopePaths[scope]}/${scope === 'platform' ? 'accounts' : 'members'}`,
    )
    assignment = await openAssignment()
    selector = await openSelector(assignment)
    assert(await checkbox(selector, '内置普通成员').isChecked())
    await checkbox(selector, '自定义角色 3').check()
    await closeSelector(selector, true)
    await assignment.getByRole('button', { name: /保存角色$/ }).click()
    await assignment.waitFor({ state: 'hidden' })
    assert.deepEqual(report.saves.at(-1).payload.roleIds, ['role-0', 'role-1', 'role-3'])
    report.checks.push(`${scope} 作用域回显及保存使用当前空间角色和原接口`)
  }
  await mkdir(layoutUiRoot, { recursive: true })
  assignment = await openAssignment()
  selector = await openSelector(assignment)
  const panel = selector.locator('[class*="selectionPanel"]')
  const selectedItems = panel.locator('[class*="selectedItems"]')
  const table = selector.locator('[class*="tablePanel"]')
  await panel.getByRole('button', { name: '清空选择', exact: true }).click()
  assert(await panel.getByText('从左侧选择角色', { exact: true }).isVisible())
  assert(await panel.getByLabel('已选择 0 项', { exact: true }).isVisible())
  assert.equal(await panel.getByRole('button', { name: '清空选择' }).isDisabled(), true)
  assert(await selector.getByText('支持跨页选择', { exact: true }).isVisible())
  report.checks.push('角色空态提供选择引导、数量徽标和禁用清空，多选提示支持跨页选择')
  await selector.screenshot({ path: resolve(layoutUiRoot, '角色空选择.png') })
  const before = { dialog: await selector.boundingBox(), table: await table.boundingBox() }
  for (let pageNumber = 1; pageNumber <= 5; pageNumber += 1) {
    await selector.locator('thead').getByRole('checkbox').check()
    if (pageNumber < 5) {
      await selector.getByTitle('下一页').click()
      const nextRow = pageNumber === 1 ? '自定义角色 10' : `长名称角色 ${pageNumber * 10}`
      await selector.getByRole('row').filter({ hasText: nextRow }).waitFor()
    }
  }
  await selector.locator('.ant-pagination-item-1').click()
  await checkbox(selector, '内置普通成员').waitFor()
  const shortTags = []
  for (const name of ['审阅', '统计', '成员', '归档', '巡检']) {
    shortTags.push(
      await selectedItems
        .locator('.ant-tag')
        .filter({ hasText: new RegExp(`^${name}$`) })
        .boundingBox(),
    )
  }
  const listWidth = await selectedItems.evaluate((element) => element.clientWidth)
  assert(shortTags.every((tag) => tag.width < listWidth / 2))
  assert(shortTags.some((tag, index) => index > 0 && tag.y === shortTags[index - 1].y))
  assert(shortTags.some((tag) => tag.y > shortTags[0].y))
  report.shortTags = shortTags
  report.checks.push('已选短角色按内容宽度同行，空间不足时自动换行')
  await selector.screenshot({ path: resolve(layoutUiRoot, '角色已选侧栏.png') })
  const selected = { dialog: await selector.boundingBox(), table: await table.boundingBox() }
  const scroll = await selectedItems.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return {
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflow: getComputedStyle(element).overflow,
    }
  })
  assert(scroll.scrollHeight > scroll.height && scroll.scrollTop > 0)
  assert.equal(scroll.overflow, 'auto')
  assert(scroll.scrollWidth <= scroll.width)
  await panel.locator('.ant-tag-close-icon').last().click()
  assert.equal(await panel.locator('.ant-tag').count(), 42)
  await panel.getByRole('button', { name: '清空选择', exact: true }).click()
  const cleared = { dialog: await selector.boundingBox(), table: await table.boundingBox() }
  for (const result of [selected, cleared]) {
    for (const area of ['dialog', 'table']) {
      for (const key of ['x', 'y', 'width', 'height']) {
        assert(Math.abs(result[area][key] - before[area][key]) <= 1, `${area}.${key} 发生布局偏移`)
      }
    }
  }
  report.layout = { before, selected, cleared, scroll }
  report.checks.push('43 项跨页已选角色及长名称仅在侧栏内滚动，移除和清空不改变弹窗或表格边界')
  await closeSelector(selector, false)
  await assignment.getByRole('button', { name: /^取\s*消$/ }).click()
  await assignment.waitFor({ state: 'hidden' })
  assignment = await openAssignment()
  await page.setViewportSize({ width: 390, height: 844 })
  selector = await openSelector(assignment)
  const bounds = await selector.boundingBox()
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 390)
  assert(bounds.y >= 0 && bounds.y + bounds.height <= 844)
  const confirmButton = selector.getByRole('button', { name: /^确定选择$/ })
  const confirmBounds = await confirmButton.boundingBox()
  assert(confirmBounds.y + confirmBounds.height <= 844)
  await page.locator('.ant-message-notice').waitFor({ state: 'hidden' })
  await selector.screenshot({ path: resolve(uiRoot, '角色选择器窄屏.png') })
  await closeSelector(selector, true)
  report.checks.push('390px 窄屏弹窗和确认按钮保持在视口内，内容可滚动且能确认回填')
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.unexpectedApi, [])
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error.stack
  report.accessibility = await page.locator('body').ariaSnapshot()
  await page.screenshot({ path: resolve(evidenceRoot, 'failure.png'), fullPage: true })
  process.exitCode = 1
} finally {
  await writeFile(resolve(evidenceRoot, 'browser.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
