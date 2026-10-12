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
const baseUrl = process.argv.find((value) => /^https?:/.test(value)) || 'http://127.0.0.1:9999'
const channel = process.argv.includes('--chrome') ? 'chrome' : 'msedge'
const browserSuffix = channel === 'chrome' ? '-chrome' : ''
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const screenshotPath = resolve(
  featureRoot,
  `ui/route-transition-login-midpoint${browserSuffix}.png`,
)
const evidencePath = resolve(
  featureRoot,
  `测试证据/route-transition-visibility${browserSuffix}.json`,
)
const browser = await chromium.launch({ channel, headless: true })

/** 暂停首次整页过渡于 160ms，记录实际快照伪元素的计算样式。 */
function observeVisibility() {
  window.__routeVisibility = { events: [] }
  const nativeStart = document.startViewTransition.bind(document)
  /** 从浏览器实际计算样式提取绘制、尺寸、裁切与变换信息。 */
  function pseudoStyle(pseudo) {
    const style = getComputedStyle(document.documentElement, pseudo)
    return Object.fromEntries(
      [
        'width',
        'height',
        'display',
        'visibility',
        'opacity',
        'transform',
        'overflow',
        'overflowX',
        'overflowY',
        'position',
        'zIndex',
        'contain',
        'isolation',
        'animationName',
        'animationDuration',
      ].map((name) => [name, style[name]]),
    )
  }
  /** 保留原生调用，待快照存在后暂停动画供像素验证。 */
  document.startViewTransition = function observeStart(...args) {
    const transition = nativeStart(...args)
    transition.ready.then(
      () => {
        const animations = document.documentElement
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.pseudoElement?.includes('(route-layout)'))
        if (
          !animations.some(
            (animation) => animation.effect.pseudoElement === '::view-transition-new(route-layout)',
          )
        )
          return
        if (window.__routeVisibility.paused) return
        for (const animation of animations) {
          animation.pause()
          animation.currentTime = 160
        }
        window.__routeVisibility.paused = true
        window.__routeVisibility.pathname = location.pathname
        window.__routeVisibility.animations = animations.map((animation) => ({
          name: animation.animationName,
          pseudo: animation.effect.pseudoElement,
          currentTime: animation.currentTime,
          duration: animation.effect.getTiming().duration,
          playState: animation.playState,
        }))
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.__routeVisibility.styles = Object.fromEntries(
              [
                '::view-transition',
                '::view-transition-group(route-layout)',
                '::view-transition-image-pair(route-layout)',
                '::view-transition-old(route-layout)',
                '::view-transition-new(route-layout)',
                '::view-transition-group(root)',
              ].map((pseudo) => [pseudo, pseudoStyle(pseudo)]),
            )
            window.__routeVisibility.sampled = true
          }),
        )
      },
      (error) =>
        window.__routeVisibility.events.push({ readyError: `${error.name}: ${error.message}` }),
    )
    return transition
  }
}

try {
  const defaultContext = await browser.newContext()
  const defaultPage = await defaultContext.newPage()
  await defaultPage.goto(`${baseUrl}/login`)
  const defaultEnvironment = await defaultPage.evaluate(() => ({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    supported: typeof document.startViewTransition === 'function',
    userAgent: navigator.userAgent,
  }))
  await defaultContext.close()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  await context.addInitScript(observeVisibility)
  await context.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/login')
        return route.fulfill({
          status: 200,
          json: {
            user,
            accessToken: 'qa-fake-route-animation-token',
            absoluteExpiresAt: '2030-01-01T00:00:00.000Z',
          },
        })
      const body = fixtureResponse(url, 'filled')
      assert(body !== undefined, `未配置的视觉测试 API：${url.pathname}`)
      return route.fulfill({ status: 200, json: body })
    },
  )
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${baseUrl}/login`)
  await page.locator('.route-transition-layout').waitFor()
  const loadedWrapper = await page.locator('.route-transition-layout').evaluate((element) => ({
    className: element.className,
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }))
  await page.getByLabel('账号', { exact: true }).fill('qa_animation')
  await page.getByLabel('密码', { exact: true }).fill('qa_animation_only')
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await page.waitForURL(`${baseUrl}/workspaces`)
  await page.waitForFunction(() => window.__routeVisibility.sampled)
  await page.waitForTimeout(100)
  await mkdir(dirname(screenshotPath), { recursive: true })
  await page.screenshot({ path: screenshotPath })
  const evidence = {
    baseUrl,
    channel,
    browserVersion: browser.version(),
    defaultEnvironment,
    motionPreferenceOverride: false,
    loadedWrapper,
    mockApi: true,
    screenshotPath,
    pageErrors,
    ...(await page.evaluate(() => window.__routeVisibility)),
  }
  await mkdir(dirname(evidencePath), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify({ screenshotPath, evidencePath, evidence }))
} finally {
  await browser.close()
}
