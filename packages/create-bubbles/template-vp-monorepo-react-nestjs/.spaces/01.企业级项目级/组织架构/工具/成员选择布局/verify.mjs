import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const baseUrl = process.argv.find((value) => /^https?:/.test(value)) || 'http://127.0.0.1:10000'
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const uiRoot = resolve(featureRoot, 'ui/成员选择布局')
const evidenceRoot = resolve(featureRoot, '测试证据/成员选择布局')
const report = { mockData: true, pageErrors: [], unexpectedApi: [], checks: [], layouts: [] }
const browser = await chromium.launch({ channel: 'msedge', headless: true })

/** 执行可复核的浏览器断言，并记录通过的场景。 */
async function check(name, action) {
  await action()
  report.checks.push(name)
}

/** 比较空选与选择后的实际边界，容忍不足一像素的布局舍入。 */
function equalBounds(before, after) {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.ok(
      Math.abs(before[key] - after[key]) < 1,
      `${key} 不应随选择变化: ${JSON.stringify({ before, after })}`,
    )
  }
}

/** 同时采集弹窗、组织轨道、表格和已选容器的边界。 */
async function layout(dialog) {
  return {
    dialog: await dialog.boundingBox(),
    scope: await dialog.locator('[class*="filterPanel"]').boundingBox(),
    table: await dialog.locator('[class*="tablePanel"]').boundingBox(),
    selection: await dialog.locator('[class*="selectionPanel"]').boundingBox(),
  }
}

try {
  await mkdir(uiRoot, { recursive: true })
  await mkdir(evidenceRoot, { recursive: true })
  const pageHtml = (await (await fetch(`${baseUrl}/`)).text()).replace(
    /<script type="module" src="\/src\/main\.tsx[^"]*"><\/script>/,
    '',
  )
  for (const multiple of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1497, height: 900 } })
    page.setDefaultTimeout(15000)
    page.on('pageerror', (error) => report.pageErrors.push(error.message))
    await page.route('**/api/**', (route) => {
      report.unexpectedApi.push(route.request().url())
      return route.abort()
    })
    await page.route('**/__member_layout_qa__', (route) =>
      route.fulfill({ contentType: 'text/html', body: pageHtml }),
    )
    await page.goto(`${baseUrl}/__member_layout_qa__`)
    await page.evaluate(async (multiple) => {
      const componentUrl =
        '/src/components/Selector/OrganizationMemberSelector/OrganizationMemberBrowser.tsx'
      const componentSource = await (await fetch(componentUrl)).text()
      const i18nUrl = componentSource.match(/import \{ useI18n \} from "([^"]+)"/)[1]
      const [react, reactDom, i18n, store, component, antd, pro, css, theme, locale] =
        await Promise.all([
          import('/@id/react'),
          import('/@id/react-dom/client'),
          import(i18nUrl),
          import('/src/i18n/index.ts'),
          import(componentUrl),
          import('/@id/antd'),
          import('/@id/@ant-design/pro-components'),
          import('/@id/@ant-design/cssinjs'),
          import('/src/config/theme.ts'),
          import('/src/i18n/ui-locale.ts'),
          import('/src/styles/index.css'),
          import('/src/styles/dream.css'),
        ])
      const React = react.default
      const candidates = Array.from({ length: 44 }, (_, index) => ({
        userId: `qa-member-${index + 1}`,
        name:
          index >= 3 && index <= 6
            ? ['甲', '乙', '丙', '丁'][index - 3]
            : index === 43
              ? '演示长名称成员'.repeat(10)
              : `演示成员${index + 1}`,
        account:
          index >= 3 && index <= 6 ? `q${index + 1}` : `qa.member.${index + 1}@example.invalid`,
        disabled: index === 1,
        identities: [
          {
            memberId: `qa-membership-${index + 1}`,
            scopeName: '演示企业',
            organizationUnits: [],
            positions: [],
            roles: [],
          },
        ],
      }))
      const ref = React.createRef()
      const qa = { ref, candidates, confirmations: [], queries: [] }
      window.__memberLayoutQA = qa
      const uiLocale = locale.getUiLocale('zh_CN')
      reactDom.default.createRoot(document.getElementById('root')).render(
        React.createElement(
          i18n.default,
          { store: store.appI18nStore },
          React.createElement(
            css.StyleProvider,
            { layer: true },
            React.createElement(
              antd.ConfigProvider,
              { theme: theme.appTheme, locale: uiLocale.antd },
              React.createElement(
                pro.ProConfigProvider,
                { intl: uiLocale.pro },
                React.createElement(component.default, {
                  ref,
                  candidateContextKey: 'qa-company',
                  scope: { type: 'company' },
                  multiple,
                  request: async (input) => {
                    qa.queries.push(input)
                    const rows = candidates.filter((candidate) =>
                      `${candidate.name} ${candidate.account}`.includes(input.query || ''),
                    )
                    return {
                      items: rows.slice(
                        (input.page - 1) * input.pageSize,
                        input.page * input.pageSize,
                      ),
                      total: rows.length,
                    }
                  },
                  resolve: async (ids) => candidates.filter((row) => ids.includes(row.userId)),
                  onConfirm: (ids, rows) => qa.confirmations.push({ ids, rows }),
                }),
              ),
            ),
          ),
        ),
      )
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('成员选择器未能挂载')), 10000)
        /** 等待真实组件暴露 show，避免测试依赖固定挂载延迟。 */
        const waitForRef = () => {
          if (!ref.current) return requestAnimationFrame(waitForRef)
          clearTimeout(timeout)
          resolve()
        }
        waitForRef()
      })
      ref.current.show([], [])
    }, multiple)
    const mode = multiple ? '多选' : '单选'
    const dialog = page.getByRole('dialog', { name: '选择成员', exact: true })
    const panel = dialog.locator('[class*="selectionPanel"]')
    const list = panel.locator('[class*="selectedItems"]')
    await dialog.getByText('演示成员1', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    const empty = await layout(dialog)
    await check(`${mode}：组织、表格、已选区分栏且空态占位`, async () => {
      assert.ok(empty.scope.x < empty.table.x)
      assert.ok(empty.selection.x >= empty.table.x + empty.table.width)
      assert.equal(empty.selection.width, 280)
      assert.equal(await panel.getByRole('button', { name: '清空选择' }).isDisabled(), true)
      assert(await panel.getByText('从左侧选择成员', { exact: true }).isVisible())
      assert(await panel.getByLabel('已选择 0 项', { exact: true }).isVisible())
    })
    await dialog
      .locator('tr.ant-table-row')
      .first()
      .getByRole(multiple ? 'checkbox' : 'radio')
      .check()
    await panel.getByLabel('已选择 1 项', { exact: true }).waitFor()
    await check(`${mode}：姓名首字头像与完整账号悬停提示可用`, async () => {
      assert.equal(await panel.locator('[class*="avatar"]').innerText(), '演')
      const text = panel.getByText('演示成员1 · qa.member.1@example.invalid', { exact: true })
      await text.hover()
      await page.getByRole('tooltip').filter({ hasText: 'qa.member.1@example.invalid' }).waitFor()
      await panel.getByRole('button', { name: '清空选择' }).hover()
      await page.getByRole('tooltip').waitFor({ state: 'hidden' })
    })
    await check(`${mode}：选择与移除不推动弹窗、表格或组织轨道`, async () => {
      const selected = await layout(dialog)
      for (const key of Object.keys(empty)) equalBounds(empty[key], selected[key])
      await list.locator('.ant-tag-close-icon').first().click()
      await panel.getByLabel('已选择 0 项', { exact: true }).waitFor()
      const removed = await layout(dialog)
      for (const key of Object.keys(empty)) equalBounds(empty[key], removed[key])
    })
    await check(`${mode}：停用候选保留禁选`, async () => {
      assert.equal(
        await dialog
          .locator('tr.ant-table-row')
          .nth(1)
          .getByRole(multiple ? 'checkbox' : 'radio')
          .isDisabled(),
        true,
      )
    })
    await check(`${mode}：跨页选择保留与长名称回显`, async () => {
      for (const firstMember of [1, 21, 41]) {
        await dialog.getByText(`演示成员${firstMember}`, { exact: true }).waitFor()
        if (multiple) await dialog.locator('.ant-table-header input[type="checkbox"]').check()
        if (firstMember < 41) await dialog.locator('.ant-pagination-next').click()
      }
      if (!multiple) await dialog.locator('tr.ant-table-row').last().getByRole('radio').check()
      await panel.getByLabel(`已选择 ${multiple ? 43 : 1} 项`, { exact: true }).waitFor()
      const selected = await layout(dialog)
      for (const key of Object.keys(empty)) equalBounds(empty[key], selected[key])
      report.layouts.push({ multiple, empty, selected })
    })
    if (multiple) {
      await check('多选：短标签按内容宽度同行，空间不足自动换行', async () => {
        const bounds = []
        for (const account of ['q4', 'q5', 'q6', 'q7']) {
          bounds.push(await list.locator('.ant-tag').filter({ hasText: account }).boundingBox())
        }
        const width = await list.evaluate((element) => element.clientWidth)
        assert.ok(bounds.every((item) => item.width < width / 2))
        assert.ok(bounds.some((item, index) => index > 0 && item.y === bounds[index - 1].y))
        assert.ok(bounds.some((item) => item.y > bounds[0].y))
        report.layouts.at(-1).shortTags = bounds
      })
    }
    await check(`${mode}：已选列表自动滚动，长名称不产生横向溢出`, async () => {
      const metrics = await list.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return {
          overflow: getComputedStyle(element).overflow,
          height: element.clientHeight,
          scrollHeight: element.scrollHeight,
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
          scrollTop: element.scrollTop,
        }
      })
      assert.equal(metrics.overflow, 'auto')
      assert.equal(metrics.scrollWidth, metrics.width)
      if (multiple) assert.ok(metrics.scrollTop > 0)
      report.layouts.at(-1).scroll = metrics
      assert.ok((await list.locator('.ant-tag').last().textContent()).includes('演示长名称成员'))
      await dialog.locator('.ant-pagination-item-1').click()
      await dialog.getByText('演示成员1', { exact: true }).waitFor()
      await list.evaluate((element) => {
        element.scrollTop = 0
      })
      await dialog.screenshot({ path: resolve(uiRoot, `成员${mode}已选侧栏.png`) })
    })
    await check(`${mode}：确认只回传稳定 userId 与候选`, async () => {
      await dialog.getByRole('button', { name: '确定选择' }).click()
      await dialog.waitFor({ state: 'hidden' })
      const result = await page.evaluate(() => window.__memberLayoutQA.confirmations)
      assert.equal(result.length, 1)
      assert.equal(result[0].ids.length, multiple ? 43 : 1)
      assert.deepEqual(
        result[0].rows.map((row) => row.userId),
        result[0].ids,
      )
    })
    await page.evaluate((multiple) => {
      const qa = window.__memberLayoutQA
      const rows = multiple ? qa.candidates.filter((row) => !row.disabled) : [qa.candidates.at(-1)]
      qa.ref.current.show(
        rows.map((row) => row.userId),
        rows,
      )
    }, multiple)
    await dialog.getByText('演示成员1', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    await check(`${mode}：较矮桌面视口内确认按钮可见`, async () => {
      await page.setViewportSize({ width: 1497, height: 692 })
      const ok = dialog.getByRole('button', { name: '确定选择' })
      await ok.scrollIntoViewIfNeeded()
      const bounds = await ok.boundingBox()
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 692)
      await page.setViewportSize({ width: 1497, height: 900 })
    })
    await check(`${mode}：清空不重排，取消不提交临时选择`, async () => {
      const before = await layout(dialog)
      await panel.getByRole('button', { name: '清空选择' }).click()
      await panel.getByLabel('已选择 0 项', { exact: true }).waitFor()
      const after = await layout(dialog)
      for (const key of Object.keys(before)) equalBounds(before[key], after[key])
      await dialog.getByRole('button', { name: '取 消' }).click()
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await page.evaluate(() => window.__memberLayoutQA.confirmations.length), 1)
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate((multiple) => {
      const qa = window.__memberLayoutQA
      const rows = multiple ? qa.candidates.filter((row) => !row.disabled) : [qa.candidates.at(-1)]
      qa.ref.current.show(
        rows.map((row) => row.userId),
        rows,
      )
    }, multiple)
    await dialog.getByText('演示成员1', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    await check(`${mode}：窄屏已选区固定高度且确认可达`, async () => {
      const selection = await panel.boundingBox()
      assert.equal(selection.height, 160)
      const scope = await dialog.locator('[class*="filterPanel"]').boundingBox()
      const table = await dialog.locator('[class*="tablePanel"]').boundingBox()
      assert.ok(scope.height < 472, '窄屏组织轨道应按内容收缩')
      assert.ok(Math.abs(scope.width - table.width) < 1, '组织轨道应占满内容宽度')
      await panel.scrollIntoViewIfNeeded()
      const ok = dialog.getByRole('button', { name: '确定选择' })
      await ok.scrollIntoViewIfNeeded()
      const bounds = await ok.boundingBox()
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844)
      assert.equal(await ok.isEnabled(), true)
      const metrics = await list.evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        height: element.clientHeight,
        scrollHeight: element.scrollHeight,
        wrap: getComputedStyle(element).flexWrap,
      }))
      assert.equal(metrics.wrap, 'wrap')
      assert.equal(metrics.scrollWidth, metrics.width)
      if (multiple) assert.ok(metrics.scrollHeight > metrics.height)
      await page.screenshot({ path: resolve(uiRoot, `成员${mode}窄屏.png`) })
      await ok.click()
      await dialog.waitFor({ state: 'hidden' })
    })
    await page.close()
  }
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.unexpectedApi, [])
} finally {
  await writeFile(resolve(evidenceRoot, 'browser.json'), `${JSON.stringify(report, null, 2)}\n`)
  await browser.close()
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    pageErrors: report.pageErrors,
    layouts: report.layouts,
  }),
)
