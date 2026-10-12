import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureResponse, user } from '../../../../04.界面与主题/万物梦幻/工具/fixtures.mjs'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const baseUrl = 'http://localhost:9999'
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const companyPath = '/companies/qa-company'
const projectPath = `${companyPath}/projects/qa-project`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { baseUrl, browserVersion: browser.version(), mockApi: true, checks: [], errors: [] }

/** 记录真实原生过渡；按需暂停中间帧以验证速度、快照和最终绘制。 */
function observeSpeed() {
  window.__transitionSpeed = []
  const nativeStart = document.startViewTransition.bind(document)
  /** 保留原生过渡，并采样 CSS 实际曲线和动画完成状态。 */
  document.startViewTransition = function observeStart(...args) {
    const event = { snapshots: [], animationResults: [] }
    window.__transitionSpeed.push(event)
    const transition = nativeStart(...args)
    transition.ready.then(
      () => {
        const animations = document.documentElement
          .getAnimations({ subtree: true })
          .filter(
            (animation) =>
              /::view-transition-(old|new)\(route-(layout|page)\)/.test(
                animation.effect?.pseudoElement || '',
              ) && animation.effect.getTiming().duration > 1,
          )
        event.snapshots = animations.map((animation) => ({
          pseudo: animation.effect.pseudoElement,
          duration: animation.effect.getTiming().duration,
          easing: getComputedStyle(document.documentElement, animation.effect.pseudoElement)
            .animationTimingFunction,
        }))
        for (const animation of animations) {
          animation.finished.then(
            () => event.animationResults.push('finished'),
            (error) => event.animationResults.push(error.name),
          )
        }
        const freeze = window.__freezeTransition
        if (!freeze || !animations.length) return
        const regionAnimations = document.documentElement
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.pseudoElement?.endsWith(`(${freeze.region})`))
        for (const animation of regionAnimations) {
          animation.pause()
          animation.currentTime = freeze.time
        }
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            event.styles = Object.fromEntries(
              ['group', 'old', 'new'].map((part) => {
                const pseudo = `::view-transition-${part}(${freeze.region})`
                const style = getComputedStyle(document.documentElement, pseudo)
                return [
                  part,
                  Object.fromEntries(
                    ['width', 'height', 'opacity', 'visibility', 'transform'].map((key) => [
                      key,
                      style[key],
                    ]),
                  ),
                ]
              }),
            )
            event.paused = true
          }),
        )
      },
      (error) => (event.readyError = error.message),
    )
    transition.finished.then(
      () => (event.finished = true),
      (error) => (event.finishedError = error.message),
    )
    return transition
  }
}

/** 对隔离上下文提供虚构接口，避免触及真实业务和账号。 */
async function mockApi(route) {
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
  assert(body !== undefined, `未配置的 API：${url.pathname}`)
  return route.fulfill({ status: 200, json: body })
}

/** 使用真实表单进入工作空间，登录接口由夹具响应。 */
async function login(page) {
  await page.getByLabel('账号', { exact: true }).fill('qa_animation')
  await page.getByLabel('密码', { exact: true }).fill('qa_animation_only')
  await page.getByRole('button', { name: /登\s*录/ }).click()
}

/** 检查一次导航的实际时长与对称中点，恢复动画后确认自然完成。 */
async function measure({
  page,
  name,
  path,
  action,
  region = 'route-layout',
  reduce = false,
  image,
}) {
  await page.evaluate(
    (freeze) => {
      window.__transitionSpeed = []
      window.__freezeTransition = freeze
    },
    reduce ? null : { region, time: region === 'route-layout' ? 250 : 160 },
  )
  await action()
  await page.waitForURL(`${baseUrl}${path}`)
  if (!reduce) {
    await page.waitForFunction(() => window.__transitionSpeed.some((event) => event.paused))
    const event = await page.evaluate(() => window.__transitionSpeed.find((item) => item.paused))
    assert.equal(event.snapshots.length, 2, `${name} 快照数量`)
    for (const snapshot of event.snapshots) {
      assert(snapshot.pseudo.endsWith(`(${region})`), `${name} 快照区域`)
      assert.equal(snapshot.duration, region === 'route-layout' ? 500 : 320, `${name} 时长`)
      assert.equal(
        snapshot.easing,
        region === 'route-layout'
          ? 'cubic-bezier(0.45, 0, 0.55, 1)'
          : 'cubic-bezier(0.4, 0, 0.2, 1)',
        `${name} 曲线`,
      )
    }
    for (const part of ['old', 'new']) {
      assert.equal(event.styles[part].visibility, 'visible')
      assert.equal(event.styles[part].opacity, '1')
    }
    if (region === 'route-layout') {
      assert.equal(parseFloat(event.styles.group.width), 1440)
      assert.equal(parseFloat(event.styles.group.height), 1000)
      const x = Number(event.styles.new.transform.match(/matrix\(([^)]+)\)/)[1].split(',')[4])
      assert(Math.abs(x - 720) < 2, `${name} 250ms 并非位移中点：${x}`)
    }
    if (image) await page.screenshot({ path: resolve(featureRoot, `ui/${image}`) })
    await page.evaluate((name) => {
      for (const animation of document.documentElement.getAnimations({ subtree: true })) {
        if (animation.effect?.pseudoElement?.endsWith(`(${name})`)) animation.play()
      }
    }, region)
    await page.waitForFunction(() =>
      window.__transitionSpeed.filter((event) => event.paused).every((event) => event.finished),
    )
  }
  await page.waitForTimeout(reduce ? 600 : 100)
  const events = await page.evaluate(() => window.__transitionSpeed)
  assert(events.every((event) => !event.readyError && !event.finishedError))
  if (reduce) assert.equal(events.flatMap((event) => event.snapshots).length, 0)
  else {
    const active = events.find((event) => event.paused)
    assert.deepEqual(active.animationResults, ['finished', 'finished'])
  }
  report.checks.push({ name, path, region, reduce, events, image })
  console.log(`PASS ${name}`)
}

try {
  await mkdir(resolve(featureRoot, 'ui'), { recursive: true })
  for (const reduce of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      ...(reduce ? { reducedMotion: 'reduce' } : {}),
    })
    await context.addInitScript(observeSpeed)
    await context.route((url) => url.pathname.startsWith('/api/'), mockApi)
    const page = await context.newPage()
    page.on('pageerror', (error) => report.errors.push(error.message))
    await page.goto(`${baseUrl}/login`)
    await page.locator('.route-transition-layout').waitFor()
    assert.equal(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      reduce,
    )
    await measure({
      page,
      name: reduce ? '减少动态效果：登录' : '登录→工作空间',
      path: '/workspaces',
      action: () => login(page),
      reduce,
      image: reduce ? undefined : 'route-transition-speed-login-chrome.png',
    })
    const steps = [
      ['工作空间→企业', companyPath, 'route-layout'],
      ['企业菜单', `${companyPath}/projects`, 'route-page'],
      ['企业→工作空间', '/workspaces', 'route-layout'],
      ['工作空间→项目', projectPath, 'route-layout'],
    ]
    for (const [name, path, region] of reduce ? steps.slice(0, 2) : steps) {
      await measure({
        page,
        name: `${reduce ? '减少动态效果：' : ''}${name}`,
        path,
        region,
        reduce,
        action: () => page.locator(`a[href="${path}"]`).first().click(),
      })
    }
    await context.close()
  }
  assert.equal(report.errors.length, 0)
} catch (error) {
  report.errors.push(error.message)
  process.exitCode = 1
} finally {
  await writeFile(
    resolve(featureRoot, '测试证据/route-transition-speed-chrome.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
  console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors }))
}
