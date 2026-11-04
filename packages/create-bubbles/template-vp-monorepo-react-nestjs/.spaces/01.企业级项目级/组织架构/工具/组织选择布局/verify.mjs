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
const evidence = resolve(root, '测试证据/组织选择布局')
const ui = resolve(root, 'ui/组织选择布局')
const report = { mockData: true, pageErrors: [], unexpectedApi: [], checks: [], layouts: [] }
const browser = await chromium.launch({ channel: 'msedge', headless: true })

/** 执行并记录真实组件的可复核浏览器验收。 */
async function check(name, action) {
  await action()
  report.checks.push(name)
}

/** 采集弹窗及两栏边界，验证选择数量不改变布局。 */
async function bounds(dialog) {
  return {
    dialog: await dialog.boundingBox(),
    table: await dialog.locator('[class*="tablePanel"]').boundingBox(),
    panel: await dialog.locator('[class*="selectionPanel"]').boundingBox(),
  }
}

/** 对比实际几何值，容忍小于一像素的浏览器舍入。 */
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
    await page.route('**/__organization_layout_qa__', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
    await page.goto(`${baseUrl}/__organization_layout_qa__`)
    await page.evaluate(async (type) => {
      const url =
        '/src/pages/access/components/MemberAffiliations/MemberOrganizationsDialog/MemberOrganizationsDialog.tsx'
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
      const units = Array.from({ length: 42 }, (_, i) => ({
        id: `unit-${i + 1}`,
        name: `演示组织${i + 1}`,
        fullPath:
          i < 3
            ? ['研发部', '产品部', '设计部'][i]
            : i === 41
              ? '演示长组织名称'.repeat(16)
              : `演示${type === 'company' ? '企业' : '项目'} / ${i === 19 ? '搜索专用组织' : `协作组${i + 1}`}`,
        effective: i !== 40,
      }))
      const ref = React.createRef()
      const qa = {
        ref,
        scope,
        units,
        attempts: [],
        mode: 'success',
        /** 带入当前作用域身份和外部项目身份，验证回显隔离及重新打开。 */
        open({ relations = [], inactive = false, suffix = '' } = {}) {
          const member = {
            id: `qa-member${suffix}`,
            userId: `qa-user${suffix}`,
            name: `演示${type === 'company' ? '企业' : '项目'}成员${suffix}`,
          }
          const candidate = {
            userId: member.userId,
            account: 'qa.organization@example.invalid',
            name: member.name,
            accountStatus: 'active',
            disabled: false,
            disabledReason: null,
            identities: [
              {
                scope,
                scopeName: '演示作用域',
                memberId: member.id,
                memberStatus: inactive ? 'disabled' : 'active',
                scopeStatus: 'active',
                organizationUnits: relations.map(([id, duty]) => ({ id, duty })),
                positions: [],
                roles: [],
              },
              {
                scope: { type: 'project', companyId: 'qa-company', projectId: 'foreign-project' },
                scopeName: '其他演示项目',
                memberId: 'foreign-member',
                memberStatus: 'active',
                scopeStatus: 'active',
                organizationUnits: [{ id: 'foreign-unit', duty: 'leader' }],
                positions: [],
                roles: [],
              },
            ],
          }
          ref.current.show(member, candidate, units)
        },
      }
      window.__orgLayoutQA = qa
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
                onSave: async (member, relations) => {
                  qa.attempts.push({ member, relations })
                  if (qa.mode === 'throw') throw new Error('演示保存失败，请重试')
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
        const timeout = setTimeout(() => reject(new Error('组织弹窗未挂载')), 10000)
        /** 等待真实 React 组件暴露命令式入口。 */
        function ready() {
          if (!ref.current) return requestAnimationFrame(ready)
          clearTimeout(timeout)
          resolve()
        }
        ready()
      })
      qa.open({
        relations: [
          ['unit-1', 'leader'],
          ['unit-2', 'deputy'],
        ],
      })
    }, type)
    const dialog = page.getByRole('dialog')
    const panel = dialog.getByRole('region', { name: '已选组织', exact: true })
    const list = panel.locator('[class*="selectedItems"]')
    const search = dialog.getByRole('textbox', { name: '搜索组织名称或路径' })
    const row = (text) => dialog.locator('tr.ant-table-row').filter({ hasText: text })
    const ok = dialog.getByRole('button', { name: '确 定' })
    const cancel = dialog.getByRole('button', { name: '取 消' })
    await panel.getByLabel('已选择 2 项', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    const initial = await bounds(dialog)
    await check(`${name}：初始职责回显及当前作用域隔离`, async () => {
      assert.equal(await list.locator('[class*="selectedItemContent"]').count(), 2)
      assert.equal(await list.getByText('foreign-unit', { exact: true }).count(), 0)
      assert.equal(await row('研发部').locator('.ant-select').innerText(), '负责人')
      assert.equal(await row('产品部').locator('.ant-select').innerText(), '副负责人')
      assert.equal(initial.panel.width, 280)
      assert.ok(initial.panel.x >= initial.table.x + initial.table.width)
    })
    await row('设计部').getByRole('checkbox').check()
    await panel.getByLabel('已选择 3 项', { exact: true }).waitFor()
    await check(`${name}：短标签同行、换行且勾选不重排`, async () => {
      const tags = list.locator('[class*="selectedItemContent"]')
      const boxes = await Promise.all([0, 1, 2].map((i) => tags.nth(i).boundingBox()))
      assert.equal(boxes[0].y, boxes[1].y)
      assert.ok(boxes[2].y > boxes[0].y)
      stable(initial, await bounds(dialog))
    })
    await row('设计部').getByRole('combobox').click()
    await page.locator('.ant-select-item-option[title="副负责人"]').click()
    await search.fill('搜索专用')
    await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').check()
    await check(`${name}：完整路径搜索与隐藏选择保留职责`, async () => {
      assert.equal(await dialog.locator('tr.ant-table-row').count(), 1)
      assert.equal(await list.locator('[class*="selectedItemContent"]').count(), 4)
      await search.fill('')
      assert.equal(await row('研发部').locator('.ant-select').innerText(), '负责人')
      assert.equal(await row('设计部').locator('.ant-select').innerText(), '副负责人')
    })
    await dialog.screenshot({ path: resolve(ui, `${name}组织已选侧栏.png`) })
    await page.evaluate(() => {
      window.__orgLayoutQA.mode = 'false'
    })
    await ok.click()
    await page.waitForFunction(() => window.__orgLayoutQA.attempts.length === 1)
    await check(`${name}：稳定组织 ID 与职责提交，失败保留草稿`, async () => {
      assert.deepEqual(await page.evaluate(() => window.__orgLayoutQA.attempts[0].relations), [
        { organizationUnitId: 'unit-1', duty: 'leader' },
        { organizationUnitId: 'unit-2', duty: 'deputy' },
        { organizationUnitId: 'unit-3', duty: 'deputy' },
        { organizationUnitId: 'unit-20', duty: 'member' },
      ])
      assert(await dialog.isVisible())
    })
    await page.evaluate(() => {
      window.__orgLayoutQA.mode = 'throw'
    })
    await ok.click()
    await dialog.getByText('演示保存失败，请重试', { exact: true }).waitFor()
    await check(`${name}：异常可见且可重试`, async () => {
      assert.equal(await list.locator('[class*="selectedItemContent"]').count(), 4)
      await page.evaluate(() => {
        window.__orgLayoutQA.mode = 'success'
      })
      await ok.click()
      await dialog.waitFor({ state: 'hidden' })
    })
    await page.evaluate(() => window.__orgLayoutQA.open())
    await panel.getByLabel('已选择 0 项', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    const empty = await bounds(dialog)
    await check(`${name}：重开清除草稿并保留空态高度`, async () => {
      assert.equal(await search.inputValue(), '')
      assert(await panel.getByText('从左侧选择组织').isVisible())
      assert(await panel.getByRole('button', { name: '清空选择' }).isDisabled())
      stable(initial, empty)
    })
    await dialog.locator('thead').getByRole('checkbox').check()
    await panel.getByLabel('已选择 41 项', { exact: true }).waitFor()
    await check(`${name}：大量标签与长路径仅内部滚动`, async () => {
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
      const long = await list.locator('[class*="selectedItemContent"]').last().boundingBox()
      assert.ok(long.height > 44)
      stable(empty, await bounds(dialog))
      report.layouts.push({ scope: type, empty, many: await bounds(dialog), metrics })
    })
    await check(`${name}：移除与清空不重排`, async () => {
      const remove = panel.getByRole('button', { name: '移除组织 研发部', exact: true })
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
    const attempts = await page.evaluate(() => window.__orgLayoutQA.attempts.length)
    await cancel.click()
    await dialog.waitFor({ state: 'hidden' })
    await check(`${name}：取消不提交`, async () => {
      assert.equal(await page.evaluate(() => window.__orgLayoutQA.attempts.length), attempts)
    })
    await page.evaluate(() =>
      window.__orgLayoutQA.open({ relations: [['unit-41', 'deputy']], inactive: true }),
    )
    await panel.getByLabel('已选择 1 项', { exact: true }).waitFor()
    await search.fill('协作组41')
    await check(`${name}：停用关系允许保留、降级，禁止升级与新增`, async () => {
      const current = dialog.locator('tr.ant-table-row').first()
      assert.equal(await current.getByRole('checkbox').isDisabled(), false)
      await current.getByRole('combobox').click()
      assert.equal(
        await page
          .getByRole('option', { name: '负责人', exact: true })
          .getAttribute('aria-disabled'),
        'true',
      )
      await page.locator('.ant-select-item-option[title="成员"]').click()
      assert.equal(await current.locator('.ant-select').innerText(), '成员')
      await search.fill('研发部')
      assert(await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isDisabled())
      await panel.getByRole('button', { name: /移除组织/ }).click()
      await search.fill('协作组41')
      assert(await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isDisabled())
    })
    await page.evaluate(() => window.__orgLayoutQA.open({ suffix: '乙' }))
    await panel.getByLabel('已选择 0 项', { exact: true }).waitFor()
    await check(`${name}：切换成员重置搜索和选择`, async () => {
      assert.equal(await search.inputValue(), '')
      assert(
        await dialog.getByText(`编辑组织归属 · 演示${name}成员乙`, { exact: true }).isVisible(),
      )
    })
    await page.evaluate(() => {
      window.__orgLayoutQA.mode = 'pending'
    })
    await ok.click()
    await page.waitForFunction(() => typeof window.__orgLayoutQA.finishSave === 'function')
    await check(`${name}：保存中锁定编辑及关闭，支持空集合保存`, async () => {
      assert(await cancel.isDisabled())
      assert(await search.isDisabled())
      assert(await row('研发部').getByRole('checkbox').isDisabled())
      assert.deepEqual(
        await page.evaluate(() => window.__orgLayoutQA.attempts.at(-1).relations),
        [],
      )
      await page.keyboard.press('Escape')
      assert(await dialog.isVisible())
      await page.evaluate(() => window.__orgLayoutQA.finishSave(true))
      await dialog.waitFor({ state: 'hidden' })
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.__orgLayoutQA.open({ relations: [['unit-1', 'member']] }))
    await panel.getByLabel('已选择 1 项', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    await check(`${name}：390px 窄屏上下排列与确认可达`, async () => {
      const current = await bounds(dialog)
      assert.equal(current.panel.height, 160)
      assert.ok(current.panel.y >= current.table.y + current.table.height)
      assert.ok(current.dialog.x >= 0 && current.dialog.x + current.dialog.width <= 390)
      await ok.scrollIntoViewIfNeeded()
      const box = await ok.boundingBox()
      assert.ok(box.y >= 0 && box.y + box.height <= 844)
    })
    await dialog.screenshot({ path: resolve(ui, `${name}组织窄屏.png`) })
    await page.close()
  }
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.unexpectedApi, [])
  report.passed = true
  console.log(`组织选择布局：${report.checks.length} 项检查通过`)
} catch (error) {
  report.passed = false
  report.failure = error.stack
  throw error
} finally {
  await writeFile(resolve(evidence, 'browser.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
