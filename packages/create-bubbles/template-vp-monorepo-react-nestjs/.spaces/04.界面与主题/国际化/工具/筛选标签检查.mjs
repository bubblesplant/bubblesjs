import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  installFixtures,
  workspaceEntries,
} from '../../万物梦幻/工具/workspace-switch-check/fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const phase = process.argv[2] || 'after'
const baseUrl = process.argv[3] || 'http://127.0.0.1:10000'
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const report = { phase, baseUrl, executedAt: new Date().toISOString(), scenarios: [] }

/** 测量真实标签文字、裁剪容器和控件边界，兼容窄屏的上下排列。 */
async function measureLabels(page) {
  return page.locator('.ant-pro-table-search').evaluate((search) => {
    const labels = [...search.querySelectorAll('.ant-form-item-label > label')]
      .filter((label) => label.textContent.trim() && label.getClientRects().length)
      .map((label) => {
        const range = document.createRange()
        range.selectNodeContents(label)
        const text = range.getBoundingClientRect()
        const wrapper = label.parentElement.getBoundingClientRect()
        const control = label.closest('.ant-form-item').querySelector('.ant-form-item-control')
        const box = control.getBoundingClientRect()
        const sameRow = text.bottom > box.top + 1 && text.top < box.bottom - 1
        return {
          text: label.textContent,
          textWidth: text.width,
          labelWidth: wrapper.width,
          controlWidth: box.width,
          clipped: text.left < wrapper.left - 1 || text.right > wrapper.right + 1,
          overlapsControl: sameRow && text.right > box.left + 1,
        }
      })
    return {
      labels,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      tableBodyHeight: document.querySelector('.ant-table-body')?.clientHeight ?? null,
    }
  })
}

/** 验证表单可见文字完整且控件有可用宽度，表格保留独立的横向滚动。 */
function assertLayout(layout) {
  assert(layout.labels.length > 0, '没有找到筛选标签')
  for (const label of layout.labels) {
    assert(!label.clipped, `${label.text} 被裁剪`)
    assert(!label.overlapsControl, `${label.text} 与控件重叠`)
    assert(label.controlWidth > 60, `${label.text} 控件宽度不足`)
  }
  assert(layout.documentWidth <= layout.viewportWidth + 1, '页面出现横向溢出')
}

/** 在隔离的虚构授权页面记录布局及交互，不连接用户浏览器或真实业务接口。 */
async function runScenario({ name, path, width, locale = 'en_US', interact = false }) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } })
  const state = await installFixtures({ context, baseUrl, entries: workspaceEntries, locale })
  const page = await context.newPage()
  const errors = []
  const queries = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/platform/accounts') {
      queries.push(Object.fromEntries(url.searchParams))
    }
  })
  const result = { name, path, width, locale }
  try {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
    await page.locator('.ant-pro-table-search').waitFor()
    const expand = page
      .locator('.ant-pro-table-search')
      .getByText(locale === 'en_US' ? 'Expand' : '展开', { exact: true })
    if (await expand.isVisible()) {
      await expand.click()
      result.expandedSearch = true
    }
    await page.evaluate(() => document.fonts.ready)
    result.layout = await measureLabels(page)
    if (phase === 'before') {
      assert(
        result.layout.labels.some((label) => label.clipped),
        '基线未复现标签裁剪',
      )
    } else {
      assertLayout(result.layout)
    }
    if (name === 'accounts-en-1880' || name === 'accounts-en-390') {
      result.screenshot = `ui/search-labels-${phase}-${name}.png`
      await page.screenshot({ path: resolve(featureRoot, result.screenshot), fullPage: true })
    }
    if (interact && phase !== 'before') {
      const search = page.locator('.ant-pro-table-search')
      const keyword = search.getByRole('textbox')
      await keyword.fill('qa.visual')
      const queried = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return (
          url.pathname === '/api/platform/accounts' && url.searchParams.get('query') === 'qa.visual'
        )
      })
      await search.getByRole('button', { name: 'Query', exact: true }).click()
      await queried
      const reset = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return url.pathname === '/api/platform/accounts' && !url.searchParams.get('query')
      })
      await search.getByRole('button', { name: 'Reset', exact: true }).click()
      await reset
      assert.equal(await keyword.inputValue(), '')
      result.queries = queries
      await page.locator('.locale-switch-trigger').click()
      await page.getByRole('menuitemradio', { name: /简体中文/ }).click()
      await page.waitForFunction(() => document.documentElement.lang === 'zh-CN')
      result.switchedToChinese = await measureLabels(page)
      assertLayout(result.switchedToChinese)
      await page.locator('.locale-switch-trigger').click()
      await page.getByRole('menuitemradio', { name: /English/ }).click()
      await page.waitForFunction(() => document.documentElement.lang === 'en')
      result.switchedToEnglish = await measureLabels(page)
      assertLayout(result.switchedToEnglish)
    }
    assert.deepEqual(errors, [], '浏览器运行异常')
    assert.deepEqual(state.unexpected, [], '出现未配置的业务接口')
    result.passed = true
  } catch (error) {
    result.passed = false
    result.error = error.message
    result.errors = errors
    result.unexpected = state.unexpected
    throw error
  } finally {
    report.scenarios.push(result)
    await context.close()
  }
}

try {
  await mkdir(resolve(featureRoot, 'ui'), { recursive: true })
  await mkdir(resolve(featureRoot, '测试证据'), { recursive: true })
  const scenarios = [
    { name: 'accounts-en-1880', path: '/platform/accounts', width: 1880, interact: true },
    { name: 'accounts-en-1440', path: '/platform/accounts', width: 1440 },
    { name: 'accounts-en-1024', path: '/platform/accounts', width: 1024 },
    { name: 'accounts-en-768', path: '/platform/accounts', width: 768 },
    { name: 'accounts-en-390', path: '/platform/accounts', width: 390 },
    { name: 'accounts-en-320', path: '/platform/accounts', width: 320 },
    { name: 'accounts-zh-1440', path: '/platform/accounts', width: 1440, locale: 'zh_CN' },
    { name: 'companies-en-1440', path: '/platform/companies', width: 1440 },
    { name: 'roles-en-1440', path: '/platform/roles', width: 1440 },
  ]
  for (const scenario of phase === 'before' ? scenarios.slice(0, 1) : scenarios) {
    await runScenario(scenario)
  }
} finally {
  await browser.close()
  await writeFile(
    resolve(featureRoot, `测试证据/search-labels-${phase}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(JSON.stringify(report, null, 2))
}
