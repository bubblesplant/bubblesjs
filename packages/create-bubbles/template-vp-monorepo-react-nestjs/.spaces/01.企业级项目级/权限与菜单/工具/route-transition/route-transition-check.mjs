import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fixtureResponse,
  user,
  workspaces,
} from '../../../../04.界面与主题/万物梦幻/工具/fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const baseUrl = process.argv.find((value) => /^https?:/.test(value)) || 'http://127.0.0.1:9999'
const outputRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../测试证据')
const companyPath = '/companies/qa-company'
const projectPath = `${companyPath}/projects/qa-project`
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const report = {
  baseUrl,
  browserVersion: browser.version(),
  mockApi: true,
  scenarios: [],
  failures: [],
}

/** 记录原生过渡与真实动画生命期，避免仅凭 API 调用或 ready 瞬间误判动画有效。 */
function installTransitionObserver({ supported }) {
  window.__routeTransitionEvidence = []
  if (!supported) {
    document.startViewTransition = undefined
    return
  }
  const nativeStart = document.startViewTransition?.bind(document)
  if (!nativeStart) return

  /** 返回可序列化的快照伪元素动画状态与几何变化。 */
  function animationState(animation) {
    const pseudo = animation.effect?.pseudoElement
    const style = pseudo?.startsWith('::view-transition-group(')
      ? getComputedStyle(document.documentElement, pseudo)
      : undefined
    return {
      name: animation.animationName,
      pseudo,
      playState: animation.playState,
      currentTime: animation.currentTime,
      duration: animation.effect?.getTiming().duration,
      geometry: style
        ? { width: style.width, height: style.height, transform: style.transform }
        : undefined,
      keyframes: animation.effect?.getKeyframes().map(({ transform, opacity, width, height }) => ({
        transform,
        opacity,
        width,
        height,
      })),
    }
  }

  /** 只获取当前 View Transition 快照动画，排除页面自身的装饰动画。 */
  function currentAnimations() {
    return document.documentElement
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.pseudoElement?.includes('view-transition'))
  }

  /** 保留原生调用结果，并为该次过渡附加分帧采样与完成／取消证据。 */
  document.startViewTransition = function observeStart(...args) {
    const started = performance.now()
    const event = {
      pathAtStart: location.pathname,
      viewport: { width: innerWidth, height: innerHeight },
      beforePageRects: [...document.querySelectorAll('.route-transition-page')].map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      }),
      beforeLayoutRects: [...document.querySelectorAll('.route-transition-layout')].map(
        (element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        },
      ),
      samples: [],
      animationResults: [],
    }
    window.__routeTransitionEvidence.push(event)
    const transition = nativeStart(...args)
    /** 在指定阶段采样运行状态，以证明动画经过多帧而非创建后立即取消。 */
    function sample(stage) {
      event.samples.push({
        stage,
        elapsed: performance.now() - started,
        animations: currentAnimations().map(animationState),
      })
    }
    transition.ready.then(
      () => {
        event.readyAt = performance.now() - started
        sample('ready')
        for (const animation of currentAnimations()) {
          animation.finished.then(
            () =>
              event.animationResults.push({
                name: animation.animationName,
                pseudo: animation.effect?.pseudoElement,
                result: 'finished',
                elapsed: performance.now() - started,
              }),
            (error) =>
              event.animationResults.push({
                name: animation.animationName,
                pseudo: animation.effect?.pseudoElement,
                result: error.name,
                elapsed: performance.now() - started,
              }),
          )
        }
        requestAnimationFrame(() => {
          sample('frame-1')
          requestAnimationFrame(() => sample('frame-2'))
        })
        setTimeout(() => sample('100ms'), 100)
      },
      (error) => {
        event.readyError = `${error.name}: ${error.message}`
      },
    )
    transition.finished.then(
      () => {
        event.finishedAt = performance.now() - started
      },
      (error) => {
        event.finishedError = `${error.name}: ${error.message}`
      },
    )
    return transition
  }
}

/** 通过真实表单提交登录，后端仅使用明确虚构的独立浏览器响应。 */
async function submitLogin(page) {
  await page.getByLabel('账号', { exact: true }).fill('qa_animation')
  await page.getByLabel('密码', { exact: true }).fill('qa_animation_only')
  await page.getByRole('button', { name: /登\s*录/ }).click()
}

/** 将一次 UI 导航与后续数据更新收集成证据，并检查实际运行的快照动画。 */
async function measure({
  page,
  scenario,
  name,
  path,
  action,
  animated = true,
  region = 'route-layout',
}) {
  await page.evaluate(() => {
    window.__routeTransitionEvidence = []
  })
  await action()
  await page.waitForURL(`${baseUrl}${path}`)
  await page.waitForTimeout(850)
  const events = await page.evaluate(() => window.__routeTransitionEvidence)
  const runningSnapshots = events.flatMap((event) =>
    event.samples
      .filter((sample) => sample.stage === '100ms')
      .flatMap((sample) => sample.animations)
      .filter(
        (animation) =>
          /::view-transition-(old|new)\((?!root\))/.test(animation.pseudo || '') &&
          animation.duration > 1 &&
          animation.playState === 'running' &&
          animation.currentTime > 0,
      ),
  )
  const check = { name, path, animated, region, runningSnapshots: runningSnapshots.length, events }
  scenario.checks.push(check)
  assert(
    events.every((event) => !event.readyError && !event.finishedError),
    `${name} 原生过渡被拒绝`,
  )
  if (animated && scenario.supported && scenario.reducedMotion === 'no-preference') {
    assert.equal(runningSnapshots.length, 2, `${name} 没有恰好一对持续运行的旧／新页面快照动画`)
    assert(
      runningSnapshots.every((animation) => animation.pseudo.endsWith(`(${region})`)),
      `${name} 过渡区域错误`,
    )
    const activeEvents = events.filter((event) =>
      event.samples.some(
        (sample) =>
          sample.stage === '100ms' &&
          sample.animations.some(
            (animation) =>
              animation.pseudo === `::view-transition-new(${region})` &&
              animation.duration > 1 &&
              animation.playState === 'running',
          ),
      ),
    )
    assert(
      activeEvents.every((event) =>
        event.animationResults
          .filter((animation) => animation.pseudo?.endsWith(`(${region})`))
          .every((animation) => animation.result === 'finished'),
      ),
      `${name} 动画被提前取消`,
    )
    if (region === 'route-layout')
      for (const event of activeEvents) {
        const group = event.samples
          .find((sample) => sample.stage === '100ms')
          .animations.find(
            (animation) => animation.pseudo === '::view-transition-group(route-layout)',
          )
        assert(group, `${name} 整页快照组缺失`)
        assert(
          group.keyframes.every((frame) => frame.transform === 'matrix(1, 0, 0, 1, 0, 0)'),
          `${name} 整页快照原点发生偏移`,
        )
        assert.equal(
          parseFloat(group.geometry.width),
          event.viewport.width,
          `${name} 快照未覆盖视口宽度`,
        )
        assert.equal(
          parseFloat(group.geometry.height),
          event.viewport.height,
          `${name} 快照未覆盖视口高度`,
        )
      }
  } else {
    assert.equal(runningSnapshots.length, 0, `${name} 意外播放了动态页面过渡`)
  }
}

/** 使用独立上下文覆盖入口、空间、菜单、历史、数据刷新与浏览器降级。 */
async function runScenario({
  name,
  reducedMotion = 'no-preference',
  supported = true,
  singleProject = false,
}) {
  const scenario = {
    name,
    reducedMotion,
    supported,
    singleProject,
    checks: [],
    pageErrors: [],
    unexpectedApi: [],
  }
  report.scenarios.push(scenario)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion,
  })
  await context.addInitScript(installTransitionObserver, { supported })
  // pathname 限定避免误拦截开发服务的 /src/api/auth.ts 模块。
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname.slice(4)
      if (path === '/auth/login')
        return route.fulfill({
          status: 200,
          json: {
            user,
            accessToken: 'qa-fake-route-animation-token',
            absoluteExpiresAt: '2030-01-01T00:00:00.000Z',
          },
        })
      if (path === '/auth/logout') return route.fulfill({ status: 200, json: { loggedOut: true } })
      const body =
        singleProject && path === '/workspaces'
          ? {
              user,
              workspaces: workspaces.filter((workspace) => workspace.scope.type === 'project'),
            }
          : fixtureResponse(url, 'filled')
      if (body === undefined || route.request().method() !== 'GET') {
        scenario.unexpectedApi.push(`${route.request().method()} ${path}`)
        return route.fulfill({ status: 501, json: { message: '专项测试未配置的 API' } })
      }
      await new Promise((resolveWait) =>
        setTimeout(resolveWait, path.endsWith('/projects') ? 350 : 80),
      )
      return route.fulfill({ status: 200, json: body })
    },
  )
  const page = await context.newPage()
  page.on('pageerror', (error) => scenario.pageErrors.push(error.message))
  try {
    await page.goto(`${baseUrl}/login`)
    await page.getByLabel('账号', { exact: true }).waitFor()
    await measure({
      page,
      scenario,
      name: singleProject ? '登录单项目直达' : '冷登录进入工作空间',
      path: singleProject ? projectPath : '/workspaces',
      action: () => submitLogin(page),
    })
    if (!singleProject) {
      const links = [
        ['冷工作空间进入企业', companyPath],
        ['企业菜单切换', `${companyPath}/projects`],
        ['企业返回工作空间', '/workspaces'],
        ['冷工作空间进入项目', projectPath],
        ['项目返回工作空间', '/workspaces'],
        ['键盘热工作空间进入企业', companyPath],
      ]
      for (const [label, path] of links)
        await measure({
          page,
          scenario,
          name: label,
          path,
          region: label === '企业菜单切换' ? 'route-page' : 'route-layout',
          action: async () => {
            const link = page.locator(`a[href="${path}"]`).first()
            if (label.startsWith('键盘')) {
              await link.focus()
              await link.press('Enter')
            } else await link.click()
          },
        })
      await measure({
        page,
        scenario,
        name: '浏览器后退',
        path: '/workspaces',
        action: () => page.goBack(),
      })
      await measure({
        page,
        scenario,
        name: '浏览器前进',
        path: companyPath,
        action: () => page.goForward(),
      })
      await measure({
        page,
        scenario,
        name: '同路由权限重新校验',
        path: companyPath,
        animated: false,
        action: () =>
          page.evaluate(() => window.dispatchEvent(new Event('workspace-access-refresh'))),
      })
    }
    await measure({
      page,
      scenario,
      name: '退出返回登录',
      path: '/login',
      action: async () => {
        await page.getByRole('button', { name: '账户菜单', exact: true }).click()
        await page.getByRole('menuitem', { name: '退出登录' }).click()
      },
    })
    assert.equal(scenario.pageErrors.length, 0, '页面运行时异常')
    assert.equal(scenario.unexpectedApi.length, 0, '存在未配置的测试 API')
  } catch (error) {
    scenario.failure = error.message
    report.failures.push({ scenario: name, message: error.message })
  } finally {
    await context.close()
  }
}

try {
  await runScenario({ name: '正常动画' })
  await runScenario({ name: '单项目默认入口', singleProject: true })
  await runScenario({ name: '减少动态效果', reducedMotion: 'reduce' })
  await runScenario({ name: '不支持原生 API', supported: false })
} finally {
  await browser.close()
  await mkdir(outputRoot, { recursive: true })
  const output = resolve(outputRoot, 'route-transition-check.json')
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(
    JSON.stringify({
      output,
      checks: report.scenarios.reduce((total, item) => total + item.checks.length, 0),
      failures: report.failures,
    }),
  )
  process.exitCode = report.failures.length ? 1 : 0
}
