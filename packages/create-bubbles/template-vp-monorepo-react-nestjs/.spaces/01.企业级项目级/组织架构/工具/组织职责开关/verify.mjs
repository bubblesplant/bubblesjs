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
const evidence = resolve(root, '测试证据/组织职责开关')
const ui = resolve(root, 'ui/组织职责开关')
const report = {
  mockData: true,
  pageErrors: [],
  unexpectedApi: [],
  checks: [],
  outputs: {},
  layouts: [],
}
const browser = await chromium.launch({ channel: 'msedge', headless: true })

/** 执行并记录真实组件验收，任何断言失败即停止交付。 */
async function check(name, action) {
  await action()
  report.checks.push(name)
}

try {
  await mkdir(evidence, { recursive: true })
  await mkdir(ui, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(12000)
  page.on('pageerror', (error) => report.pageErrors.push(error.message))
  await page.route('**/api/**', (route) => {
    report.unexpectedApi.push(route.request().url())
    return route.abort()
  })
  const html = (await (await fetch(baseUrl + '/')).text()).replace(
    /<script type="module" src="\/src\/main\.tsx[^"]*"><\/script>/,
    '',
  )
  await page.route('**/__organization_duties_qa__', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.goto(baseUrl + '/__organization_duties_qa__')
  await page.evaluate(async () => {
    const url = '/src/components/Selector/OrganizationSelector/OrganizationSelector.tsx'
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
    const refs = { default: React.createRef(), false: React.createRef(), true: React.createRef() }
    const units = Array.from({ length: 42 }, (_, index) => ({
      id: 'org-demo-' + (index + 1),
      name: '演示组织' + (index + 1),
      fullPath:
        index < 3
          ? ['演示研发', '演示产品', '演示设计'][index]
          : index === 41
            ? '演示长组织路径'.repeat(16)
            : '演示组织 / 协作组' + (index + 1),
      effective: index !== 40,
    }))
    const qa = {
      refs,
      units,
      attempts: [],
      outcome: 'success',
      active: 'default',
      /** 不传入任何成员数据，仅以组织列表打开业务单可复用的选择器。 */
      open(mode = 'default', options = {}) {
        qa.active = mode
        refs[mode].current.show({ units, ...options })
      },
    }
    window.__dutiesQA = qa
    const selectors = Object.entries(refs).map(([mode, ref]) =>
      React.createElement(component.default, {
        key: mode,
        ref,
        ...(mode === 'default' ? {} : { enableDuties: mode === 'true' }),
        onConfirm: async (value) => {
          qa.attempts.push({ mode, value })
          if (qa.outcome === 'throw') throw new Error('演示确认异常')
          if (qa.outcome === 'pending')
            return await new Promise((resolve) => {
              qa.finishSave = resolve
            })
          return qa.outcome !== 'false'
        },
      }),
    )
    dom.default.createRoot(document.getElementById('root')).render(
      React.createElement(
        i18n.default,
        { store: store.appI18nStore },
        React.createElement(
          css.StyleProvider,
          { layer: true },
          React.createElement(
            antd.ConfigProvider,
            {
              theme: theme.appTheme,
              locale: locale.getUiLocale('zh_CN').antd,
            },
            ...selectors,
          ),
        ),
      ),
    )
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('组织选择器未挂载')), 10000)
      /** 等待三个真实组件暴露命令式入口。 */
      function ready() {
        if (Object.values(refs).some((ref) => !ref.current)) return requestAnimationFrame(ready)
        clearTimeout(timeout)
        resolve()
      }
      ready()
    })
    qa.open('default', {
      value: ['org-demo-1', 'org-demo-2', 'org-demo-1'],
      relations: [{ organizationUnitId: 'org-demo-3', duty: 'leader' }],
    })
  })
  const dialog = page.getByRole('dialog')
  const panel = dialog.getByRole('region', { name: '已选组织', exact: true })
  const list = panel.locator('[class*="selectedItems"]')
  const search = dialog.getByRole('textbox', { name: '搜索组织名称或路径' })
  const row = (name) => dialog.locator('tr.ant-table-row').filter({ hasText: name })
  const ok = dialog.getByRole('button', { name: '确 定' })
  const cancel = dialog.getByRole('button', { name: '取 消' })

  /** 重新打开时等待 React 更新完成，避免把上一会话状态当作当前回显。 */
  async function open(mode, options = {}, count = 0) {
    await page.evaluate(({ mode, options }) => window.__dutiesQA.open(mode, options), {
      mode,
      options,
    })
    await panel.getByLabel('已选择 ' + count + ' 项', { exact: true }).waitFor()
    await page.waitForTimeout(350)
  }

  /** 点击真实确定按钮并读取组件回调，不预先构造输出证据。 */
  async function confirm() {
    await ok.click()
    await dialog.waitFor({ state: 'hidden' })
    return await page.evaluate(() => window.__dutiesQA.attempts.at(-1).value)
  }

  await panel.getByLabel('已选择 2 项', { exact: true }).waitFor()
  await page.waitForTimeout(350)
  await check('默认关闭：无职责列、无下拉框、无成员提示，ID 回显去重并忽略隐藏关系', async () => {
    assert.equal(await dialog.getByRole('columnheader', { name: '职责', exact: true }).count(), 0)
    assert.equal(await dialog.getByRole('combobox').count(), 0)
    assert.equal(await dialog.getByText('所有组织归属同等有效').count(), 0)
    assert.equal(await list.getByText('演示设计', { exact: true }).count(), 0)
    const boxes = await Promise.all(
      [0, 1].map((i) => list.locator('[class*="selectedItemContent"]').nth(i).boundingBox()),
    )
    assert.equal(boxes[0].y, boxes[1].y)
  })
  await dialog.getByText('选择组织单元', { exact: true }).click()
  await dialog.screenshot({ path: resolve(ui, '关闭职责.png') })
  await check('默认关闭：点击确定实际输出 string[]', async () => {
    report.outputs.withoutDuties = await confirm()
    assert.deepEqual(report.outputs.withoutDuties, ['org-demo-1', 'org-demo-2'])
    await writeFile(
      resolve(evidence, 'without-duties.json'),
      JSON.stringify(report.outputs.withoutDuties, null, 2),
    )
  })
  await open(
    'false',
    { value: ['org-demo-1'], relations: [{ organizationUnitId: 'org-demo-2', duty: 'leader' }] },
    1,
  )
  await check('显式关闭：搜索与勾选只返回 ID，不混入隐藏职责', async () => {
    assert.equal(await dialog.getByRole('combobox').count(), 0)
    await search.fill('演示产品')
    await row('演示产品').getByRole('checkbox').check()
    await search.fill('')
    assert.deepEqual(await confirm(), ['org-demo-1', 'org-demo-2'])
  })
  await open('default', { relations: [{ organizationUnitId: 'org-demo-1', duty: 'leader' }] })
  await check('纯组织：仅提供 relations 不产生选中项，空选择确认输出 []', async () => {
    assert.deepEqual(await confirm(), [])
  })
  await open(
    'true',
    {
      relations: [
        { organizationUnitId: 'org-demo-1', duty: 'member' },
        { organizationUnitId: 'org-demo-1', duty: 'leader' },
      ],
    },
    1,
  )
  await check('开启职责：关系回显去重，保留已有职责，新组织默认为成员', async () => {
    assert.equal(await row('演示研发').locator('.ant-select').innerText(), '负责人')
    await row('演示产品').getByRole('checkbox').check()
    assert.equal(await row('演示产品').locator('.ant-select').innerText(), '成员')
  })
  await row('演示研发').getByRole('combobox').click()
  await page.locator('.ant-select-item-option[title="副负责人"]').click()
  await row('演示研发').getByRole('combobox').click()
  await page.locator('.ant-select-item-option[title="负责人"]').click()
  await dialog.getByText('选择组织单元', { exact: true }).click()
  await page.waitForTimeout(350)
  await dialog.screenshot({ path: resolve(ui, '开启职责.png') })
  await check('开启职责：实际修改下拉框并点击确定，输出组织 ID 与 duty', async () => {
    report.outputs.withDuties = await confirm()
    assert.deepEqual(report.outputs.withDuties, [
      { organizationUnitId: 'org-demo-1', duty: 'leader' },
      { organizationUnitId: 'org-demo-2', duty: 'member' },
    ])
    await writeFile(
      resolve(evidence, 'with-duties.json'),
      JSON.stringify(report.outputs.withDuties, null, 2),
    )
  })
  await open(
    'true',
    {
      value: ['org-demo-2', 'org-demo-3', 'org-demo-2'],
      relations: [
        { organizationUnitId: 'org-demo-1', duty: 'leader' },
        { organizationUnitId: 'org-demo-2', duty: 'deputy' },
      ],
    },
    2,
  )
  await check('开启职责：显式 value 优先决定选中项，未选组织不输出', async () => {
    assert.deepEqual(await confirm(), [
      { organizationUnitId: 'org-demo-2', duty: 'deputy' },
      { organizationUnitId: 'org-demo-3', duty: 'member' },
    ])
  })
  await open(
    'true',
    {
      relations: [
        { organizationUnitId: 'org-demo-1', duty: 'leader' },
        { organizationUnitId: 'org-demo-2', duty: 'deputy' },
      ],
    },
    2,
  )
  await check('移除后重选恢复成员，保留其他组织职责；搜索不丢失选择', async () => {
    await panel.getByRole('button', { name: '移除组织 演示研发', exact: true }).click()
    await row('演示研发').getByRole('checkbox').check()
    assert.equal(await row('演示研发').locator('.ant-select').innerText(), '成员')
    assert.equal(await row('演示产品').locator('.ant-select').innerText(), '副负责人')
    await search.fill('演示设计')
    await row('演示设计').getByRole('checkbox').check()
    assert.deepEqual(await confirm(), [
      { organizationUnitId: 'org-demo-2', duty: 'deputy' },
      { organizationUnitId: 'org-demo-1', duty: 'member' },
      { organizationUnitId: 'org-demo-3', duty: 'member' },
    ])
  })
  await open('true', { value: ['org-demo-1'] }, 1)
  await check('开启职责：清空后确认输出 []', async () => {
    await panel.getByRole('button', { name: '清空选择' }).click()
    assert.deepEqual(await confirm(), [])
  })

  for (const mode of ['false', 'true']) {
    await open(mode, { value: ['org-demo-1'] }, 1)
    await check(mode + '：取消与 hide 不调用确认，重开清除搜索和草稿', async () => {
      const before = await page.evaluate(() => window.__dutiesQA.attempts.length)
      await search.fill('不存在的演示组织')
      await cancel.click()
      await dialog.waitFor({ state: 'hidden' })
      await open(mode)
      assert.equal(await search.inputValue(), '')
      assert(await panel.getByText('从左侧选择组织').isVisible())
      await page.evaluate(() => window.__dutiesQA.refs[window.__dutiesQA.active].current.hide())
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await page.evaluate(() => window.__dutiesQA.attempts.length), before)
    })
    await open(mode, { value: ['org-demo-1'] }, 1)
    await check(mode + '：返回 false 保留草稿，抛错可见且可重试', async () => {
      await page.evaluate(() => {
        window.__dutiesQA.outcome = 'false'
      })
      await ok.click()
      await panel.getByLabel('已选择 1 项', { exact: true }).waitFor()
      await page.evaluate(() => {
        window.__dutiesQA.outcome = 'throw'
      })
      await ok.click()
      await dialog.getByText('演示确认异常', { exact: true }).waitFor()
      assert.equal(await list.locator('[class*="selectedItemContent"]').count(), 1)
      await page.evaluate(() => {
        window.__dutiesQA.outcome = 'success'
      })
      await confirm()
    })
    await open(mode, { value: ['org-demo-1'] }, 1)
    await check(mode + '：确认期间锁定编辑、关闭、重开及同一 tick 重复确认', async () => {
      const before = await page.evaluate(() => window.__dutiesQA.attempts.length)
      await page.evaluate(() => {
        window.__dutiesQA.outcome = 'pending'
      })
      await ok.evaluate((button) => {
        button.click()
        button.click()
      })
      await page.waitForFunction(() => typeof window.__dutiesQA.finishSave === 'function')
      assert.equal(await page.evaluate(() => window.__dutiesQA.attempts.length), before + 1)
      assert(await search.isDisabled())
      assert(await cancel.isDisabled())
      assert(await row('演示研发').getByRole('checkbox').isDisabled())
      assert(await panel.getByRole('button', { name: '清空选择' }).isDisabled())
      assert(
        await panel.getByRole('button', { name: '移除组织 演示研发', exact: true }).isDisabled(),
      )
      if (mode === 'true') assert(await row('演示研发').getByRole('combobox').isDisabled())
      await page.evaluate(() => {
        const qa = window.__dutiesQA
        qa.refs[qa.active].current.hide()
        qa.open(qa.active, { value: ['org-demo-2'] })
      })
      await page.keyboard.press('Escape')
      assert(await dialog.isVisible())
      assert(await list.getByText('演示研发', { exact: true }).isVisible())
      assert.equal(await list.getByText('演示产品', { exact: true }).count(), 0)
      await page.evaluate(() => {
        window.__dutiesQA.finishSave(true)
        delete window.__dutiesQA.finishSave
        window.__dutiesQA.outcome = 'success'
      })
      await dialog.waitFor({ state: 'hidden' })
    })
  }
  await open('false')
  await check('纯组织：大量标签内部 overflow:auto，布局高度不变，无横向溢出', async () => {
    const before = await dialog.boundingBox()
    await dialog.locator('thead').getByRole('checkbox').check()
    await panel.getByLabel('已选择 42 项', { exact: true }).waitFor()
    const after = await dialog.boundingBox()
    for (const key of ['x', 'y', 'width', 'height'])
      assert.ok(Math.abs(before[key] - after[key]) < 1, JSON.stringify({ key, before, after }))
    const metrics = await list.evaluate((el) => ({
      height: el.clientHeight,
      contentHeight: el.scrollHeight,
      width: el.clientWidth,
      contentWidth: el.scrollWidth,
      overflow: getComputedStyle(el).overflow,
    }))
    assert.equal(metrics.overflow, 'auto')
    assert.ok(metrics.contentHeight > metrics.height)
    assert.equal(metrics.contentWidth, metrics.width)
    report.layouts.push({ mode: false, before, after, metrics })
    await cancel.click()
    await dialog.waitFor({ state: 'hidden' })
  })
  await open('false', { value: ['org-demo-41'] }, 1)
  await check('纯组织：业务注入禁选，已有失效组织仍可移除', async () => {
    await page.evaluate(() =>
      window.__dutiesQA.open('false', {
        value: ['org-demo-41'],
        isOrganizationDisabled: (unit) => !unit.effective,
      }),
    )
    await search.fill('协作组41')
    assert.equal(
      await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isDisabled(),
      false,
    )
    await panel.getByRole('button', { name: /移除组织/ }).click()
    assert(await dialog.locator('tr.ant-table-row').first().getByRole('checkbox').isDisabled())
    await cancel.click()
    await dialog.waitFor({ state: 'hidden' })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  for (const mode of ['false', 'true']) {
    await open(mode, { value: ['org-demo-1', 'org-demo-2'] }, 2)
    await page.waitForTimeout(350)
    await check(mode + '：390px 窄屏固定已选区，上下排列，确定按钮可达', async () => {
      const selected = await panel.boundingBox()
      const table = await dialog.locator('[class*="tablePanel"]').boundingBox()
      const box = await dialog.boundingBox()
      assert.equal(selected.height, 160)
      assert.ok(selected.y >= table.y + table.height)
      assert.ok(box.x >= 0 && box.x + box.width <= 390)
      await ok.scrollIntoViewIfNeeded()
      const button = await ok.boundingBox()
      assert.ok(button.y >= 0 && button.y + button.height <= 844)
      report.layouts.push({ mode, viewport: 390, selected, table, dialog: box })
    })
    await dialog.screenshot({
      path: resolve(ui, mode === 'true' ? '开启职责窄屏.png' : '关闭职责窄屏.png'),
    })
    await cancel.click()
    await dialog.waitFor({ state: 'hidden' })
  }
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.unexpectedApi, [])
  report.passed = true
  console.log('组织职责开关：' + report.checks.length + ' 项检查通过；两种实际确认 JSON 已归档')
} catch (error) {
  report.passed = false
  report.failure = error.stack
  throw error
} finally {
  await writeFile(resolve(evidence, 'browser.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
