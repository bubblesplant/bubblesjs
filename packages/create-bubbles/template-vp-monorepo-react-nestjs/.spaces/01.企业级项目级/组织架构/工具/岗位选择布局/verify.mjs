import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const baseUrl = process.argv.find((value) => /^https?:/.test(value)) || 'http://127.0.0.1:10000'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidence = resolve(root, '测试证据/岗位选择布局')
const ui = resolve(root, 'ui/岗位选择布局')
const report = { mockData: true, pageErrors: [], unexpectedApi: [], checks: [], layouts: [] }
const browser = await chromium.launch({ channel: 'msedge', headless: true })

/** 记录已执行的真实组件浏览器断言。 */
async function check(name, action) {
  await action()
  report.checks.push(name)
}

/** 采集弹窗及左右两栏的实际几何边界。 */
async function bounds(dialog) {
  return {
    dialog: await dialog.boundingBox(),
    table: await dialog.locator('[class*="tablePanel"]').boundingBox(),
    panel: await dialog.locator('[class*="selectionPanel"]').boundingBox(),
  }
}

/** 验证选择和交互状态变化前后尺寸及位置一致。 */
function stable(before, after) {
  for (const region of Object.keys(before)) {
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(
        Math.abs(before[region][key] - after[region][key]) < 1,
        `${region}.${key}: ${JSON.stringify({ before, after })}`,
      )
    }
  }
}

try {
  await mkdir(evidence, { recursive: true })
  await mkdir(ui, { recursive: true })
  const html = (await (await fetch(`${baseUrl}/`)).text()).replace(
    /<script type="module" src="\/src\/main\.tsx[^"]*"><\/script>/,
    '',
  )
  for (const type of ['company', 'project']) {
    const name = type === 'company' ? '企业' : '项目'
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.setDefaultTimeout(12000)
    page.on('pageerror', (error) => report.pageErrors.push(error.message))
    await page.route('**/api/**', (route) => {
      report.unexpectedApi.push(route.request().url())
      return route.abort()
    })
    await page.route('**/__position_layout_qa__', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
    await page.goto(`${baseUrl}/__position_layout_qa__`)
    await page.evaluate(async (type) => {
      const url =
        '/src/pages/access/components/MemberAffiliations/MemberPositionsDialog/MemberPositionsDialog.tsx'
      const source = await (await fetch(url)).text()
      const i18nUrl = source.match(/import \{ useI18n \} from "([^"]+)"/)[1]
      const [react, dom, i18n, store, component, antd, css, theme, locale] = await Promise.all([
        import('/@id/react'),
        import('/@id/react-dom/client'),
        import(i18nUrl),
        import('/src/i18n/index.ts'),
        import(url),
        import('/@id/antd'),
        import('/@id/@ant-design/cssinjs'),
        import('/src/config/theme.ts'),
        import('/src/i18n/ui-locale.ts'),
        import('/src/styles/index.css'),
        import('/src/styles/dream.css'),
      ])
      const React = react.default
      const scope =
        type === 'company'
          ? { type, companyId: 'qa-company' }
          : { type, companyId: 'qa-company', projectId: 'qa-project' }
      const positions = Array.from({ length: 42 }, (_, i) => ({
        id: `position-${i + 1}`,
        scope,
        name:
          i < 3
            ? ['研发', '产品', '设计'][i]
            : i === 41
              ? '演示长岗位名称'.repeat(16)
              : i === 19
                ? '搜索专用岗位'
                : `演示岗位${i + 1}`,
        code:
          i < 3
            ? ['rd', 'pm', 'ux'][i]
            : i === 41
              ? 'long-position-code-'.repeat(12)
              : `qa-position-${i + 1}`,
        description: '',
        status: i === 40 ? 'disabled' : 'active',
        version: 1,
        memberCount: 0,
        createdAt: '2026-11-04T00:00:00Z',
        updatedAt: '2026-11-04T00:00:00Z',
      }))
      const ref = React.createRef()
      const qa = {
        ref,
        scope,
        positions,
        attempts: [],
        mode: 'success',
        /** 每次打开重新提供当前身份与其他项目身份，用于验证作用域和草稿隔离。 */
        open({
          ids = [],
          inactive = false,
          disabled = false,
          accountStatus = 'active',
          suffix = '',
        } = {}) {
          const member = {
            id: `qa-member${suffix}`,
            userId: `qa-user${suffix}`,
            name: `演示${type === 'company' ? '企业' : '项目'}成员${suffix}`,
          }
          const candidate = {
            userId: member.userId,
            account: 'qa.position@example.invalid',
            name: member.name,
            accountStatus,
            disabled,
            disabledReason: disabled ? 'memberInactive' : null,
            identities: [
              {
                scope,
                scopeName: '演示作用域',
                memberId: member.id,
                memberStatus: inactive ? 'disabled' : 'active',
                scopeStatus: 'active',
                organizationUnits: [],
                positions: ids.map((id) => ({ id })),
                roles: [],
              },
              {
                scope: { type: 'project', companyId: 'qa-company', projectId: 'foreign-project' },
                scopeName: '其他演示项目',
                memberId: 'foreign-member',
                memberStatus: 'active',
                scopeStatus: 'active',
                organizationUnits: [],
                positions: [{ id: 'foreign-position' }],
                roles: [],
              },
            ],
          }
          ref.current.show(member, candidate, positions)
        },
      }
      window.__positionLayoutQA = qa
      dom.default.createRoot(document.getElementById('root')).render(
        React.createElement(
          i18n.default,
          { store: store.appI18nStore },
          React.createElement(
            css.StyleProvider,
            { layer: true },
            React.createElement(
              antd.ConfigProvider,
              { theme: theme.appTheme, locale: locale.getUiLocale('zh_CN').antd },
              React.createElement(component.default, {
                ref,
                scope,
                onSave: async (member, ids) => {
                  qa.attempts.push({ member, ids })
                  if (qa.mode === 'throw') throw new Error('演示岗位保存失败，请重试')
                  if (qa.mode === 'pending')
                    return await new Promise((resolve) => {
                      qa.finishSave = resolve
                    })
                  return qa.mode !== 'false'
                },
              }),
            ),
          ),
        ),
      )
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('岗位弹窗未挂载')), 10000)
        /** 等待真实 React 组件暴露命令式入口。 */
        function ready() {
          if (!ref.current) return requestAnimationFrame(ready)
          clearTimeout(timeout)
          resolve()
        }
        ready()
      })
      qa.open({ ids: ['position-1', 'position-2', 'position-1'] })
    }, type)
    const dialog = page.getByRole('dialog')
    const panel = dialog.getByRole('region', { name: '已选岗位', exact: true })
    const list = panel.locator('[class*="selectedItems"]')
    const search = dialog.getByRole('textbox', { name: '搜索岗位名称或编码' })
    const row = (text) => dialog.locator('tr.ant-table-row').filter({ hasText: text })
    const ok = dialog.getByRole('button', { name: '确 定' })
    const cancel = dialog.getByRole('button', { name: '取 消' })
    await panel.getByLabel('已选择 2 项', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    const initial = await bounds(dialog)
    await check(`${name}：初始去重、作用域隔离及名称编码回显`, async () => {
      assert.equal(await list.locator('[class*="selectedItemContent"]').count(), 2)
      assert.equal(await list.getByText('foreign-position', { exact: true }).count(), 0)
      assert(await list.getByText('研发 · rd', { exact: true }).isVisible())
      assert.equal(initial.panel.width, 280)
      assert.ok(initial.panel.x >= initial.table.x + initial.table.width)
    })
    await row('设计').getByRole('checkbox').check()
    await panel.getByLabel('已选择 3 项', { exact: true }).waitFor()
    await check(`${name}：短标签同行及换行，勾选不重排`, async () => {
      const tags = list.locator('[class*="selectedItemContent"]')
      const boxes = await Promise.all([0, 1, 2].map((i) => tags.nth(i).boundingBox()))
      assert.equal(boxes[0].y, boxes[1].y)
      assert.ok(boxes[2].y > boxes[0].y)
      stable(initial, await bounds(dialog))
    })
    await check(`${name}：名称与编码搜索，隐藏选择保留`, async () => {
      await search.fill('搜索专用')
      assert.equal(await dialog.locator('tr.ant-table-row').count(), 1)
      await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').check()
      await search.fill(' QA-POSITION-20 ')
      assert.equal(await dialog.locator('tr.ant-table-row').count(), 1)
      assert(await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isChecked())
      assert.equal(await list.locator('[class*="selectedItemContent"]').count(), 4)
      await search.fill('')
    })
    await page.evaluate(() => document.activeElement?.blur())
    await dialog.screenshot({ path: resolve(ui, `${name}岗位已选侧栏.png`) })
    await page.evaluate(() => {
      window.__positionLayoutQA.mode = 'false'
    })
    await ok.click()
    await page.waitForFunction(() => window.__positionLayoutQA.attempts.length === 1)
    await check(`${name}：提交稳定岗位 ID 完整集合，失败保留草稿`, async () => {
      assert.deepEqual(await page.evaluate(() => window.__positionLayoutQA.attempts[0].ids), [
        'position-1',
        'position-2',
        'position-3',
        'position-20',
      ])
      assert(await dialog.isVisible())
    })
    await page.evaluate(() => {
      window.__positionLayoutQA.mode = 'throw'
    })
    await ok.click()
    await dialog.getByText('演示岗位保存失败，请重试', { exact: true }).waitFor()
    await check(`${name}：异常可见并可重试`, async () => {
      assert.equal(await list.locator('[class*="selectedItemContent"]').count(), 4)
      await page.evaluate(() => {
        window.__positionLayoutQA.mode = 'success'
      })
      await ok.click()
      await dialog.waitFor({ state: 'hidden' })
    })
    await page.evaluate(() => window.__positionLayoutQA.open())
    await panel.getByLabel('已选择 0 项', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    const empty = await bounds(dialog)
    await check(`${name}：重开清除搜索、错误和草稿，空态高度固定`, async () => {
      assert.equal(await search.inputValue(), '')
      assert(await panel.getByText('从左侧选择岗位').isVisible())
      assert(await panel.getByRole('button', { name: '清空选择' }).isDisabled())
      assert.equal(await dialog.getByText('演示岗位保存失败，请重试').count(), 0)
      stable(initial, empty)
    })
    await dialog.locator('thead').getByRole('checkbox').check()
    await panel.getByLabel('已选择 41 项', { exact: true }).waitFor()
    await check(`${name}：大量标签、长名称及编码只在容器内滚动`, async () => {
      const metrics = await list.evaluate((el) => ({
        h: el.clientHeight,
        sh: el.scrollHeight,
        w: el.clientWidth,
        sw: el.scrollWidth,
        overflow: getComputedStyle(el).overflow,
      }))
      assert.ok(metrics.sh > metrics.h)
      assert.ok(metrics.sw <= metrics.w)
      assert.equal(metrics.overflow, 'auto')
      assert.ok(
        (await list.locator('[class*="selectedItemContent"]').last().boundingBox()).height > 44,
      )
      stable(empty, await bounds(dialog))
      report.layouts.push({ scope: type, empty, many: await bounds(dialog), metrics })
    })
    await check(`${name}：悬停、键盘焦点、移除及清空不重排`, async () => {
      const remove = panel.getByRole('button', { name: '移除岗位 研发 · rd', exact: true })
      await remove.hover()
      stable(empty, await bounds(dialog))
      await remove.focus()
      stable(empty, await bounds(dialog))
      await remove.press('Enter')
      await panel.getByLabel('已选择 40 项', { exact: true }).waitFor()
      stable(empty, await bounds(dialog))
      await panel.getByRole('button', { name: '清空选择' }).click()
      await panel.getByLabel('已选择 0 项', { exact: true }).waitFor()
      stable(empty, await bounds(dialog))
    })
    const attempts = await page.evaluate(() => window.__positionLayoutQA.attempts.length)
    await cancel.click()
    await dialog.waitFor({ state: 'hidden' })
    await check(`${name}：取消不提交`, async () => {
      assert.equal(await page.evaluate(() => window.__positionLayoutQA.attempts.length), attempts)
    })
    await page.evaluate(() =>
      window.__positionLayoutQA.open({ ids: ['position-41'], inactive: true }),
    )
    await panel.getByLabel('已选择 1 项', { exact: true }).waitFor()
    await check(`${name}：停用任职可保留或移除，停用成员不可新增`, async () => {
      await search.fill('qa-position-41')
      assert.equal(
        await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isDisabled(),
        false,
      )
      assert(await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isChecked())
      await search.fill('研发')
      assert(await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isDisabled())
      await panel.getByRole('button', { name: /移除岗位/ }).click()
      await search.fill('qa-position-41')
      assert(await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isDisabled())
    })
    await check(`${name}：停用账号、禁选候选及停用岗位不可新增`, async () => {
      for (const input of [{ accountStatus: 'disabled' }, { disabled: true }, {}]) {
        await page.evaluate((input) => window.__positionLayoutQA.open(input), input)
        await panel.getByLabel('已选择 0 项', { exact: true }).waitFor()
        await search.fill(Object.keys(input).length ? '研发' : 'qa-position-41')
        assert(await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isDisabled())
      }
    })
    await page.evaluate(() => window.__positionLayoutQA.open({ suffix: '乙' }))
    await panel.getByLabel('已选择 0 项', { exact: true }).waitFor()
    await check(`${name}：切换成员重置搜索和选择`, async () => {
      assert.equal(await search.inputValue(), '')
      assert(
        await dialog.getByText(`编辑岗位任职 · 演示${name}成员乙`, { exact: true }).isVisible(),
      )
    })
    await page.evaluate(() => {
      window.__positionLayoutQA.mode = 'pending'
    })
    await ok.click()
    await page.waitForFunction(() => typeof window.__positionLayoutQA.finishSave === 'function')
    await check(`${name}：保存中锁定编辑与关闭，支持空数组清空`, async () => {
      assert(await cancel.isDisabled())
      assert(await search.isDisabled())
      assert(await row('研发').getByRole('checkbox').isDisabled())
      assert.deepEqual(await page.evaluate(() => window.__positionLayoutQA.attempts.at(-1).ids), [])
      await page.keyboard.press('Escape')
      assert(await dialog.isVisible())
      await page.evaluate(() => window.__positionLayoutQA.finishSave(true))
      await dialog.waitFor({ state: 'hidden' })
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.__positionLayoutQA.open({ ids: ['position-1'] }))
    await panel.getByLabel('已选择 1 项', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    await check(`${name}：390px 窄屏上下排列，选择稳定且确认可达`, async () => {
      const current = await bounds(dialog)
      assert.equal(current.panel.height, 160)
      assert.ok(current.panel.y >= current.table.y + current.table.height)
      assert.ok(current.dialog.x >= 0 && current.dialog.x + current.dialog.width <= 390)
      await row('产品').getByRole('checkbox').check()
      await panel.getByLabel('已选择 2 项', { exact: true }).waitFor()
      stable(current, await bounds(dialog))
      await ok.scrollIntoViewIfNeeded()
      const box = await ok.boundingBox()
      assert.ok(box.y >= 0 && box.y + box.height <= 844)
    })
    await page.evaluate(() => document.activeElement?.blur())
    await dialog.screenshot({ path: resolve(ui, `${name}岗位窄屏.png`) })
    await page.close()
  }
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.unexpectedApi, [])
  report.passed = true
  console.log(`岗位选择布局：${report.checks.length} 项检查通过`)
} catch (error) {
  report.passed = false
  report.failure = error.stack
  throw error
} finally {
  await writeFile(resolve(evidence, 'browser.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
