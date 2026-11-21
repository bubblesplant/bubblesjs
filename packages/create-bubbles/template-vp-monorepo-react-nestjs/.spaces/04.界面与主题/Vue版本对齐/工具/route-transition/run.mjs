import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { install } from '../fixtures.mjs'
import { installTransitionObserver } from './observer.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const baseUrl = process.env.VUE_TEST_URL || 'http://127.0.0.1:10000'
const output = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const companyPath = '/companies/qa-company'
const projectPath = `${companyPath}/projects/qa-project`
const report = {
  executedAt: new Date().toISOString(),
  baseUrl,
  mockApi: true,
  scenarios: [],
  failures: [],
}
let browser

/** 取得 Vue 应用已安装的真实 Router；仅用来制造无法通过正常 UI 稳定制造的取消和连续导航。 */
function appRouter() {
  const router = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$router
  if (!router) throw new Error('应用 Router 未挂载')
  return router
}

/** 所有路由快照动画均由原生 API 实测，排除非路由装饰。 */
function routeAnimations(event, stage = '100ms') {
  return (event.samples.find((sample) => sample.stage === stage)?.animations || []).filter(
    (animation) =>
      /^::view-transition-(old|new)\(route-(page|layout)\)$/.test(animation.pseudo || ''),
  )
}

/** 核对持续运行、精确时长、方向、完成结果及边界，静态截图不能替代这些断言。 */
function assertAnimation({ entry, region, path }) {
  const expectedDuration = region === 'route-layout' ? 500 : 320
  assert.equal(entry.region, region.replace('route-', ''), '导航许可边界错误')
  assert.ok(
    !entry.readyError && !entry.updateError && !entry.finishedError,
    '原生过渡生命周期被拒绝',
  )
  assert.equal(entry.pathAfterUpdate, path, '快照更新回调未提交目标路由')
  assert.equal(entry.pathAtFinish, path, '动画结束时路由不正确')
  const pair = routeAnimations(entry)
  assert.equal(pair.length, 2, '100ms 时没有恰好一对路由快照')
  assert.deepEqual(pair.map((animation) => animation.pseudo).sort(), [
    `::view-transition-new(${region})`,
    `::view-transition-old(${region})`,
  ])
  for (const animation of pair) {
    assert.equal(animation.duration, expectedDuration, '真实动画时长不匹配')
    assert.equal(animation.playState, 'running', '100ms 时路由动画没有持续运行')
    assert.ok(
      animation.currentTime > 0 && animation.currentTime < expectedDuration,
      '路由动画进度无效',
    )
    const frames = animation.keyframes.map((frame) => frame.transform)
    if (animation.pseudo.includes('-old('))
      assert.deepEqual(frames, ['translateX(0px)', 'translateX(-100%)'], '旧快照没有向左移出')
    else assert.deepEqual(frames, ['translateX(100%)', 'translateX(0px)'], '新快照没有从右侧进入')
  }
  const completed = entry.animationResults.filter((result) =>
    /^::view-transition-(old|new)\(route-/.test(result.pseudo || ''),
  )
  assert.equal(completed.length, 2, '快照动画没有完整结束证据')
  assert.ok(
    completed.every((result) => result.result === 'finished'),
    '正常导航动画被提前取消',
  )
  assert.ok(entry.finishedAt - entry.readyAt >= expectedDuration - 70, '动画生命周期过短')
  if (region === 'route-layout') {
    const group = entry.samples
      .find((sample) => sample.stage === '100ms')
      ?.animations.find((animation) => animation.pseudo === '::view-transition-group(route-layout)')
    assert.ok(group, '整页快照组缺失')
    assert.ok(
      Math.abs(parseFloat(group.geometry.width) - entry.viewport.width) <= 1,
      '整页快照未覆盖视口宽度',
    )
    assert.ok(
      Math.abs(parseFloat(group.geometry.height) - entry.viewport.height) <= 1,
      '整页快照未覆盖视口高度',
    )
  } else {
    for (const selector of ['.workspace-header', '.workspace-sidebar']) {
      assert.deepEqual(
        entry.afterGeometry[selector],
        entry.beforeGeometry[selector],
        `${selector} 在同空间导航时移动`,
      )
    }
  }
}

/** 保存一个检查的全部原生证据，失败后继续下一独立场景。 */
async function check({ scenario, page, name, run }) {
  const result = { name, status: 'running' }
  scenario.checks.push(result)
  try {
    await run(result)
    result.status = 'passed'
    console.log(`PASS ${scenario.name}/${name}`)
  } catch (error) {
    result.status = 'failed'
    result.error = error.stack || error.message
    report.failures.push({ scenario: scenario.name, name, message: error.message })
    console.log(`FAIL ${scenario.name}/${name}: ${error.message}`)
    await page
      .screenshot({
        path: resolve(output, 'ui', `vue-transition-failure-${scenario.name}-${name}.png`),
        fullPage: true,
      })
      .catch(() => {})
  } finally {
    if (!page.isClosed()) {
      const probe = await page.evaluate(() => window.__vueTransitionProbe).catch(() => undefined)
      if (probe) {
        result.events ??= probe.events
        scenario.unhandled.push(...probe.unhandled)
        await page
          .evaluate(() => {
            window.__vueTransitionProbe.unhandled = []
          })
          .catch(() => {})
      }
    }
  }
}

/** 在检查之间等待清理；首次加载只用于建立基线，不充当 SPA 动画覆盖。 */
async function startAt({ page, path }) {
  await page.goto(baseUrl + path)
  await page.waitForSelector('h1, h2, [data-pro-table-toolbar-title]')
  await page.locator('#nprogress').waitFor({ state: 'detached' })
  await page.waitForTimeout(100)
}

/** 检查 DOM 已完成导航且快照许可、原生动画均已清除。 */
async function cleanState(page) {
  await page.waitForFunction(
    () =>
      !document.documentElement.dataset.routeTransition &&
      !document.documentElement
        .getAnimations({ subtree: true })
        .some(
          (animation) =>
            animation.effect?.pseudoElement?.includes('view-transition') &&
            animation.playState === 'running',
        ),
  )
  return page.evaluate(() => ({
    path: location.pathname,
    transition: document.documentElement.dataset.routeTransition || null,
    bodyText: document.body.innerText.slice(0, 500),
  }))
}

/** 收集一次真实 UI 导航，保留 100ms 快照并验证最终 URL、页面和动画清理。 */
async function measure({
  page,
  scenario,
  result,
  path,
  action,
  region = 'route-layout',
  animated = true,
  screenshot,
}) {
  await cleanState(page)
  await page.evaluate(() => {
    window.__vueTransitionProbe.events = []
  })
  await action()
  await page.waitForURL((url) => url.pathname === path)
  if (animated && scenario.supported && scenario.reducedMotion === 'no-preference') {
    await page.waitForFunction(
      () =>
        window.__vueTransitionProbe.events.some((event) =>
          event.samples.some((sample) => sample.stage === '100ms'),
        ),
      undefined,
      { timeout: 3000 },
    )
    if (screenshot) {
      result.screenshot = `ui/${screenshot}`
      result.screenshotAt = await page.evaluate(() => {
        window.__screenshotAnimations = document.documentElement
          .getAnimations({ subtree: true })
          .filter(
            (animation) =>
              animation.effect?.pseudoElement?.includes('view-transition') &&
              animation.playState === 'running',
          )
        for (const animation of window.__screenshotAnimations) {
          animation.pause()
          animation.currentTime = 160
        }
        return {
          pausedAt: 160,
          animations: window.__screenshotAnimations.map((animation) => ({
            pseudo: animation.effect?.pseudoElement,
            duration: animation.effect?.getTiming().duration,
            currentTime: animation.currentTime,
          })),
        }
      })
      try {
        await page.screenshot({ path: resolve(output, 'ui', screenshot), animations: 'allow' })
      } finally {
        await page.evaluate(() => {
          for (const animation of window.__screenshotAnimations || []) animation.play()
          delete window.__screenshotAnimations
        })
      }
    }
  }
  await page.waitForTimeout(850)
  result.finalState = await cleanState(page)
  result.events = await page.evaluate(() => window.__vueTransitionProbe.events)
  assert.equal(result.finalState.path, path)
  assert.ok(result.finalState.bodyText.length > 20, '目标页面未渲染')
  if (animated && scenario.supported && scenario.reducedMotion === 'no-preference') {
    assert.equal(result.events.length, 1, '一次导航没有恰好一次原生过渡')
    assertAnimation({ entry: result.events[0], region, path })
  } else assert.equal(result.events.length, 0, '页内更新或降级场景触发了原生路由过渡')
}

/** 从工作空间卡片的真实入口进入指定虚构空间。 */
async function enterSpace({ page, name }) {
  await page
    .locator('.workspace-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .locator('.workspace-enter')
    .click()
}

/** 安装独立虚构接口、原生观察器及错误记录，不接触真实后端和账户。 */
async function createScenario({ name, reducedMotion = 'no-preference', supported = true }) {
  const scenario = {
    name,
    reducedMotion,
    supported,
    checks: [],
    pageErrors: [],
    unhandled: [],
    unexpected: [],
  }
  report.scenarios.push(scenario)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion,
  })
  const state = await install(context)
  await context.addInitScript(installTransitionObserver, { supported })
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  page.on('pageerror', (error) => scenario.pageErrors.push(error.message))
  return { scenario, context, page, state }
}

/** 对正常动态模式执行认证、双层导航、历史、页内更新和取消／快速导航。 */
async function runNormal() {
  const { scenario, context, page, state } = await createScenario({ name: 'normal' })
  const run = (name, action) => check({ scenario, page, name, run: action })
  try {
    await run('cold-load', async (result) => {
      await startAt({ page, path: '/login' })
      result.events = await page.evaluate(() => window.__vueTransitionProbe.events)
      assert.equal(result.events.length, 0)
      assert.equal(
        await page.evaluate(() => window.__vueTransitionProbe.nativeSupported),
        true,
        '浏览器未启用原生 View Transition',
      )
    })
    await run('login-to-register', (result) =>
      measure({
        page,
        scenario,
        result,
        path: '/register',
        action: () => page.locator('a[href="/register"]').click(),
      }),
    )
    await run('register-to-login', (result) =>
      measure({
        page,
        scenario,
        result,
        path: '/login',
        action: () => page.locator('a[href="/login"]').click(),
      }),
    )
    await run('login-to-workspaces', async (result) => {
      await page.locator('.login-form-content input').nth(0).fill('vue_qa')
      await page.locator('.login-form-content input').nth(1).fill('FictionalPass2026')
      await measure({
        page,
        scenario,
        result,
        path: '/workspaces',
        action: () => page.locator('.login-form-content button[type="submit"]').click(),
      })
    })
    await context.addCookies([{ name: 'token', value: 'qa-only-noncredential', url: baseUrl }])
    await run('workspace-to-company', async (result) => {
      await startAt({ page, path: '/workspaces' })
      await measure({
        page,
        scenario,
        result,
        path: companyPath,
        screenshot: 'vue-transition-layout.png',
        action: () => enterSpace({ page, name: '星屿演示企业' }),
      })
    })
    await run('company-members', async (result) => {
      await startAt({ page, path: companyPath })
      await measure({
        page,
        scenario,
        result,
        path: `${companyPath}/members`,
        region: 'route-page',
        screenshot: 'vue-transition-page.png',
        action: () =>
          page
            .locator('.workspace-sidebar')
            .getByRole('menuitem', { name: '企业成员', exact: true })
            .click(),
      })
    })
    await run('history-back', (result) =>
      measure({
        page,
        scenario,
        result,
        path: companyPath,
        region: 'route-page',
        action: () => page.goBack(),
      }),
    )
    await run('history-forward', (result) =>
      measure({
        page,
        scenario,
        result,
        path: `${companyPath}/members`,
        region: 'route-page',
        action: () => page.goForward(),
      }),
    )
    await run('delayed-data-no-replay', async (result) => {
      await startAt({ page, path: companyPath })
      await page.route(
        (url) => url.pathname === `/api${companyPath}/dictionaries`,
        async (route) => {
          if (route.request().method() === 'GET')
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 450))
          await route.fallback()
        },
      )
      await measure({
        page,
        scenario,
        result,
        path: `${companyPath}/dictionaries`,
        region: 'route-page',
        action: () =>
          page
            .locator('.workspace-sidebar')
            .getByRole('menuitem', { name: '数据字典', exact: true })
            .click(),
      })
      await page
        .getByRole('button', { name: /^编\s*辑$/ })
        .first()
        .waitFor()
    })
    await run('dialog-open-no-replay', (result) =>
      measure({
        page,
        scenario,
        result,
        path: `${companyPath}/dictionaries`,
        animated: false,
        action: async () => {
          await page
            .getByRole('button', { name: /^编\s*辑$/ })
            .first()
            .click()
          await page.getByRole('dialog').waitFor()
        },
      }),
    )
    await run('dialog-input-no-replay', (result) =>
      measure({
        page,
        scenario,
        result,
        path: `${companyPath}/dictionaries`,
        animated: false,
        action: () =>
          page.getByRole('dialog').getByLabel('字典名称', { exact: true }).fill('动画验收虚构字典'),
      }),
    )
    await run('dialog-cancel-no-replay', (result) =>
      measure({
        page,
        scenario,
        result,
        path: `${companyPath}/dictionaries`,
        animated: false,
        action: async () => {
          await page
            .getByRole('dialog')
            .getByRole('button', { name: /^取\s*消$/ })
            .click()
          await page.getByRole('dialog').waitFor({ state: 'hidden' })
        },
      }),
    )
    await run('dialog-keyboard-open-save-no-replay', (result) =>
      measure({
        page,
        scenario,
        result,
        path: `${companyPath}/dictionaries`,
        animated: false,
        action: async () => {
          await page
            .getByRole('button', { name: /^编\s*辑$/ })
            .first()
            .focus()
          await page.keyboard.press('Enter')
          const dialog = page.getByRole('dialog')
          await dialog.getByLabel('字典名称', { exact: true }).fill('动画验收虚构字典')
          await dialog.getByRole('button', { name: /^保\s*存$/ }).click()
          await dialog.waitFor({ state: 'hidden' })
          await page.getByText('动画验收虚构字典', { exact: true }).first().waitFor()
        },
      }),
    )
    await run('duplicate-navigation', async (result) => {
      await startAt({ page, path: companyPath })
      await measure({
        page,
        scenario,
        result,
        path: companyPath,
        animated: false,
        action: () => page.evaluate(`(${appRouter.toString()})().replace(location.pathname)`),
      })
    })
    await run('cancel-before-each', async (result) => {
      await startAt({ page, path: companyPath })
      await page.evaluate(
        `window.__removeTestGuard = (${appRouter.toString()})().beforeEach(to => { if (to.path.endsWith('/roles')) { window.__cancelGuardVisited = true; return false } })`,
      )
      try {
        await measure({
          page,
          scenario,
          result,
          path: companyPath,
          animated: false,
          action: () =>
            page
              .locator('.workspace-sidebar')
              .getByRole('menuitem', { name: '企业角色', exact: true })
              .click(),
        })
        assert.equal(await page.evaluate(() => window.__cancelGuardVisited), true)
      } finally {
        await page.evaluate(() => window.__removeTestGuard())
      }
    })
    await run('cancel-after-snapshot-start', async (result) => {
      await startAt({ page, path: companyPath })
      await page.evaluate(
        `window.__removeTestGuard = (${appRouter.toString()})().beforeResolve(to => to.path.endsWith('/roles') ? false : undefined); window.__vueTransitionProbe.events = []`,
      )
      try {
        await page
          .locator('.workspace-sidebar')
          .getByRole('menuitem', { name: '企业角色', exact: true })
          .click()
        await page.waitForTimeout(850)
        result.finalState = await cleanState(page)
        result.events = await page.evaluate(() => window.__vueTransitionProbe.events)
        assert.equal(result.finalState.path, companyPath)
        assert.equal(result.events.length, 1, '未实际覆盖已开始快照后的取消')
        assert.ok(result.events[0].skipped > 0, '取消未跳过当前快照')
        assert.ok(result.events[0].finishedAt !== undefined, '取消后快照未完成清理')
        assert.ok(
          !result.events[0].updateError && !result.events[0].finishedError,
          '取消阻断更新或完成承诺',
        )
      } finally {
        await page.evaluate(() => window.__removeTestGuard())
      }
    })
    await run('rapid-navigation', async (result) => {
      await startAt({ page, path: companyPath })
      await page.evaluate(
        `window.__vueTransitionProbe.events = []; void (${appRouter.toString()})().push('${companyPath}/members')`,
      )
      await page.waitForFunction(() =>
        window.__vueTransitionProbe.events.some((event) => event.readyAt !== undefined),
      )
      await page.waitForTimeout(45)
      await page.evaluate(`void (${appRouter.toString()})().push('${companyPath}/roles')`)
      await page.waitForURL(`**${companyPath}/roles`)
      await page.waitForTimeout(900)
      result.finalState = await cleanState(page)
      result.events = await page.evaluate(() => window.__vueTransitionProbe.events)
      assert.equal(result.events.length, 2, '未实际覆盖两次连续快照导航')
      assert.ok(result.events[0].skipped > 0, '旧过渡未被新导航跳过')
      assert.ok(result.events[0].finishedAt !== undefined, '旧过渡没有释放')
      assertAnimation({
        entry: result.events[1],
        region: 'route-page',
        path: `${companyPath}/roles`,
      })
      assert.equal(result.finalState.path, `${companyPath}/roles`)
      await page
        .locator('[data-pro-table-toolbar-title]')
        .getByText('企业角色', { exact: true })
        .waitFor()
    })
    await run('company-to-project', async (result) => {
      await startAt({ page, path: companyPath })
      await measure({
        page,
        scenario,
        result,
        path: projectPath,
        action: () => page.evaluate(`(${appRouter.toString()})().push('${projectPath}')`),
      })
    })
    await run('project-to-workspaces', (result) =>
      measure({
        page,
        scenario,
        result,
        path: '/workspaces',
        action: () => page.getByRole('link', { name: '切换空间', exact: true }).click(),
      }),
    )
    await run('permission-redirect', async (result) => {
      state.deny = 'company.members.read'
      await startAt({ page, path: '/workspaces' })
      await measure({
        page,
        scenario,
        result,
        path: '/403',
        action: () => page.evaluate(`(${appRouter.toString()})().push('${companyPath}/members')`),
      })
      assert.ok(
        result.events.every((event) => event.pathAfterUpdate !== `${companyPath}/members`),
        '未授权页面被捕获为目标快照',
      )
      state.deny = ''
    })
    await run('examples-content-transition', async (result) => {
      await startAt({ page, path: '/examples/i18n' })
      await measure({
        page,
        scenario,
        result,
        path: '/examples/selector',
        region: 'route-page',
        action: () => page.evaluate(`(${appRouter.toString()})().push('/examples/selector')`),
      })
    })
  } finally {
    scenario.unexpected = [...state.unexpected]
    await context.close()
  }
}

/** 在减少动态效果和 API 缺失时检查同样的真实 UI 导航仍可完成。 */
async function runFallback({ name, reducedMotion, supported }) {
  const { scenario, context, page, state } = await createScenario({
    name,
    reducedMotion,
    supported,
  })
  const run = (checkName, action) => check({ scenario, page, name: checkName, run: action })
  try {
    await context.addCookies([{ name: 'token', value: 'qa-only-noncredential', url: baseUrl }])
    await run('cold-load', async (result) => {
      await startAt({ page, path: companyPath })
      result.events = await page.evaluate(() => window.__vueTransitionProbe.events)
      assert.equal(result.events.length, 0)
    })
    await run('same-space-navigation', (result) =>
      measure({
        page,
        scenario,
        result,
        path: `${companyPath}/members`,
        region: 'route-page',
        action: () =>
          page
            .locator('.workspace-sidebar')
            .getByRole('menuitem', { name: '企业成员', exact: true })
            .click(),
      }),
    )
    await run('space-selection', (result) =>
      measure({
        page,
        scenario,
        result,
        path: '/workspaces',
        action: () => page.getByRole('link', { name: '切换空间', exact: true }).click(),
      }),
    )
    await run('keyboard-space-entry', (result) =>
      measure({
        page,
        scenario,
        result,
        path: projectPath,
        action: async () => {
          const entry = page
            .locator('.workspace-card')
            .filter({ has: page.getByRole('heading', { name: '月光演示项目', exact: true }) })
            .locator('.workspace-enter')
          await entry.focus()
          await page.keyboard.press('Enter')
        },
      }),
    )
  } finally {
    scenario.unexpected = [...state.unexpected]
    await context.close()
  }
}

try {
  await mkdir(resolve(output, 'ui'), { recursive: true })
  await mkdir(resolve(output, '测试证据'), { recursive: true })
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
      'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',
    headless: true,
  })
  report.browser = browser.version()
  await runNormal()
  await runFallback({ name: 'reduced-motion', reducedMotion: 'reduce', supported: true })
  await runFallback({ name: 'unsupported', reducedMotion: 'no-preference', supported: false })
  for (const scenario of report.scenarios) {
    for (const [name, entries] of [
      ['pageerror', scenario.pageErrors],
      ['unhandledrejection', scenario.unhandled],
      ['unexpected-api', scenario.unexpected],
    ]) {
      if (entries.length) report.failures.push({ scenario: scenario.name, name, entries })
    }
  }
} catch (error) {
  report.failures.push({ name: 'runner', message: error.stack || error.message })
  console.error(error)
} finally {
  await browser?.close()
  report.finishedAt = new Date().toISOString()
  report.total = report.scenarios.flatMap((scenario) => scenario.checks).length
  report.passed = report.scenarios
    .flatMap((scenario) => scenario.checks)
    .filter((check) => check.status === 'passed').length
  await writeFile(
    resolve(output, '测试证据', 'route-transition-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
}
console.log(`RESULT ${report.passed}/${report.total}; failures=${report.failures.length}`)
process.exitCode = report.failures.length ? 1 : 0
