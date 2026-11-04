import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { base, install, scopes } from '../../../字典配置/工具/browser/fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = resolve(featureRoot, '../../..')
const catalog = await import(pathToFileURL(resolve(repoRoot, 'packages/shared/dist/utils.js')))
const baseUrl = process.argv[2] || 'http://127.0.0.1:10000'
const mode = process.argv[3] || 'verify'
assert(['baseline', 'verify'].includes(mode))
const report = {
  executedAt: new Date().toISOString(),
  mode,
  mockApi: true,
  dictionaryGetDelayMs: 450,
  checks: [],
}
const browser = await chromium.launch({ channel: 'msedge', headless: true })

/** 在 React 初始化前记录原生快照与路由滑动，不混入弹窗自身 CSS 动效。 */
function observeTransitions() {
  window.__dialogTransitions = []
  const nativeStart = document.startViewTransition.bind(document)
  document.startViewTransition = (...args) => {
    const entry = { path: location.pathname, samples: [] }
    window.__dialogTransitions.push(entry)
    const transition = nativeStart(...args)
    /** 采集实际快照动画的名称、进度与伪元素。 */
    function sample(stage) {
      entry.samples.push({
        stage,
        animations: document.documentElement
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.pseudoElement?.includes('view-transition'))
          .map((animation) => ({
            name: animation.animationName,
            pseudo: animation.effect.pseudoElement,
            playState: animation.playState,
            currentTime: animation.currentTime,
            duration: animation.effect.getTiming().duration,
          })),
      })
    }
    transition.ready.then(
      () => {
        sample('ready')
        requestAnimationFrame(() => sample('frame'))
        setTimeout(() => sample('100ms'), 100)
      },
      (error) => (entry.readyError = `${error.name}: ${error.message}`),
    )
    return transition
  }
}

try {
  report.browserVersion = browser.version()
  const context = await browser.newContext({ viewport: { width: 1517, height: 1000 } })
  await context.addInitScript(observeTransitions)
  const state = await install({ context, baseUrl, catalog })
  const page = await context.newPage()
  // 将列表响应安排在菜单转场完成后，独立验证导航与其后异步数据提交。
  await page.route(
    (url) => url.pathname.endsWith('/dictionaries'),
    async (route) => {
      if (route.request().method() === 'GET')
        await new Promise((resolveWait) => setTimeout(resolveWait, 450))
      await route.fallback()
    },
  )
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  /** 执行真实交互并核对 100ms 时仍在运行的路由快照。 */
  async function measure({ scope, name, action, animated = false }) {
    await page.evaluate(() => (window.__dialogTransitions = []))
    const beforePath = new URL(page.url()).pathname
    await action()
    await page.waitForTimeout(900)
    const events = await page.evaluate(() => window.__dialogTransitions)
    const snapshots = events.flatMap((event) =>
      event.samples
        .filter((sample) => sample.stage === '100ms')
        .flatMap((sample) => sample.animations)
        .filter(
          (animation) =>
            /::view-transition-(old|new)\(route-(page|layout)\)/.test(animation.pseudo) &&
            animation.playState === 'running' &&
            animation.duration > 1 &&
            animation.currentTime > 0,
        ),
    )
    const afterPath = new URL(page.url()).pathname
    const passed = animated
      ? snapshots.length === 2 && snapshots.every((item) => item.pseudo.endsWith('(route-page)'))
      : beforePath === afterPath && snapshots.length === 0
    report.checks.push({ scope, name, animated, beforePath, afterPath, passed, snapshots, events })
    if (mode === 'verify') assert(passed, `${scope}: ${name} 转场行为错误`)
  }

  for (const scope of scopes) {
    const path = `${base(scope)}/dictionaries`
    await page.goto(`${baseUrl}${path}`)
    const row = page.getByRole('row').filter({ hasText: `${scope.type}计量单位` })
    const edit = row.getByRole('button', { name: '编辑', exact: true })
    await edit.waitFor()
    await page.waitForTimeout(1100)
    const dialog = page.getByRole('dialog')

    await measure({ scope: scope.type, name: '鼠标打开编辑', action: () => edit.click() })
    await dialog.waitFor()
    await measure({
      scope: scope.type,
      name: '编辑表单输入',
      action: () => dialog.getByLabel('说明', { exact: true }).fill('虚构动效验证'),
    })
    await measure({
      scope: scope.type,
      name: '新增选项',
      action: () => dialog.getByRole('button', { name: '新增选项' }).click(),
    })
    await measure({
      scope: scope.type,
      name: '取消关闭',
      action: () => dialog.getByRole('button', { name: /取.*消/ }).click(),
    })
    await measure({
      scope: scope.type,
      name: '键盘重开编辑',
      action: async () => {
        await edit.focus()
        await edit.press('Enter')
      },
    })
    await measure({
      scope: scope.type,
      name: '保存与列表刷新',
      action: () => dialog.getByRole('button', { name: /确.*定/ }).click(),
    })
    await dialog.waitFor({ state: 'hidden' })
    await measure({
      scope: scope.type,
      name: '菜单返回首页',
      animated: true,
      action: async () => {
        await page
          .locator(`a[href="${base(scope)}"]`)
          .first()
          .click()
        await page.waitForURL(`${baseUrl}${base(scope)}`)
      },
    })
    // 字典表格初始化的同步更新可能中断导航快照（基线已存在）；
    // 返回字典仅用于设置“菜单切换后编辑”场景，导航动效另由既有 35 项专项验证。
    await page.locator(`a[href="${path}"]`).first().click()
    await page.waitForURL(`${baseUrl}${path}`)
    await edit.waitFor()
    await page.waitForTimeout(900)
    await measure({
      scope: scope.type,
      name: '菜单切换后打开编辑',
      action: () => edit.click(),
    })
    await measure({
      scope: scope.type,
      name: 'Escape 关闭编辑',
      action: () => page.keyboard.press('Escape'),
    })
    await dialog.waitFor({ state: 'hidden' })
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(state.unexpected, [])
  report.passed = report.checks.every((check) => check.passed)
} catch (error) {
  report.error = error.stack
  report.passed = false
  process.exitCode = 1
} finally {
  await browser.close()
  const output = resolve(featureRoot, `测试证据/route-transition-dialog-${mode}.json`)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(
    JSON.stringify({
      checks: report.checks.length,
      passed: report.passed,
      error: report.error,
      output,
    }),
  )
}
