import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 先在 apps/web 运行 vp dev，再传入其地址；只渲染真实组件和虚构候选，不访问业务接口。
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:10019'
const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const report = { browser: browser.version(), mockData: true, scenarios: [] }

try {
  const pageHtml = (await (await fetch(`${baseUrl}/`)).text()).replace(
    '<script type="module" src="/src/main.tsx"></script>',
    '',
  )
  for (const multiple of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1628, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
      console.error(error.message)
    })
    await page.route('**/__member_fixed_columns_qa__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: pageHtml,
      }),
    )
    await page.goto(`${baseUrl}/__member_fixed_columns_qa__`)
    await page.evaluate(async (multiple) => {
      const componentUrl =
        '/src/components/Selector/OrganizationMemberSelector/OrganizationMemberBrowser.tsx'
      const componentSource = await (await fetch(componentUrl)).text()
      const i18nUrl = componentSource.match(/import \{ useI18n \} from "([^"]+)"/)[1]
      const [react, reactDom, i18n, store, component] = await Promise.all([
        import('/@id/react'),
        import('/@id/react-dom/client'),
        import(i18nUrl),
        import('/src/i18n/index.ts'),
        import(componentUrl),
        import('/src/styles/index.css'),
        import('/src/styles/dream.css'),
      ])
      const React = react.default
      const candidates = ['甲', '乙'].map((name, index) => ({
        userId: `qa-member-${index}`,
        name: `演示成员${name}`,
        account: `qa.member.${index}@example.invalid`,
        disabled: false,
        identities: [
          {
            memberId: `qa-membership-${index}`,
            scopeName: '演示企业',
            organizationUnits: [],
            positions: [],
            roles: [],
          },
        ],
      }))
      const ref = React.createRef()
      reactDom.default.createRoot(document.getElementById('root')).render(
        React.createElement(
          i18n.default,
          { store: store.appI18nStore },
          React.createElement(component.default, {
            ref,
            candidateContextKey: 'qa-company',
            scope: { type: 'company', companyId: 'qa-company' },
            multiple,
            request: async () => ({ items: candidates, total: candidates.length }),
            resolve: async (ids) => candidates.filter((row) => ids.includes(row.userId)),
            onConfirm: () => {},
          }),
        ),
      )
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('成员选择器未能挂载')), 10000)
        const waitForRef = () => {
          if (!ref.current) return requestAnimationFrame(waitForRef)
          clearTimeout(timeout)
          resolve()
        }
        waitForRef()
      })
      ref.current.show([], [])
    }, multiple)
    const dialog = page.getByRole('dialog')
    const row = dialog.locator('tr.ant-table-row').first()
    await row.getByText('演示成员甲', { exact: true }).waitFor()
    await page.waitForTimeout(350)
    const cells = row.locator('td')
    const headerCells = dialog.locator('.ant-table-header th')
    const before = await cells.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().x),
    )
    const headerBefore = await headerCells.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().x),
    )
    const scrollLeft = await dialog.locator('.ant-table-body').evaluate((element) => {
      element.scrollLeft = element.scrollWidth - element.clientWidth
      return element.scrollLeft
    })
    assert.ok(scrollLeft > 100, '必须产生实际横向滚动')
    await page.waitForTimeout(150)
    const after = await cells.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().x),
    )
    const headerAfter = await headerCells.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().x),
    )
    for (const index of [0, 1, before.length - 1]) {
      assert.ok(Math.abs(before[index] - after[index]) < 1, `第 ${index} 列应固定`)
      assert.ok(Math.abs(headerBefore[index] - headerAfter[index]) < 1, `第 ${index} 列表头应固定`)
      assert.ok(Math.abs(after[index] - headerAfter[index]) < 1, `第 ${index} 列表头与数据行应对齐`)
    }
    assert.ok(before[2] - after[2] > 100, '账号列应随横向滚动移动')
    await row.getByRole(multiple ? 'checkbox' : 'radio').check()
    await dialog.getByText('已选择 1 项', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    report.scenarios.push({
      multiple,
      scrollLeft,
      before,
      after,
      headerBefore,
      headerAfter,
      selectionWorks: true,
    })
    await page.close()
  }
  await mkdir(resolve(featureRoot, '测试证据'), { recursive: true })
  await writeFile(
    resolve(featureRoot, '测试证据/成员选择固定列.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(JSON.stringify(report))
} finally {
  await browser.close()
}
