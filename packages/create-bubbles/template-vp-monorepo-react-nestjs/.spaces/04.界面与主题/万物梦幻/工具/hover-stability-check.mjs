import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureResponse, user } from './fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
)
const baseUrl = process.argv[2] || 'http://127.0.0.1:9999'
const reportRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../测试证据')
const executablePath = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  chromium.executablePath(),
  'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',
].find((path) => path && existsSync(path))
assert(executablePath, '未找到用于验证的 Chromium')
const browser = await chromium.launch({ executablePath, headless: true })
const report = {
  baseUrl,
  mockData: true,
  browserVersion: browser.version(),
  checks: [],
  failures: [],
}

/** 比较控件、相邻内容及可见子元素的几何和盒模型，包含过渡中的采样帧。 */
function checkStable(before, after) {
  assert.equal(after.length, before.length, '头部元素数量发生变化')
  for (const [index, initial] of before.entries()) {
    const current = after[index]
    for (const property of ['x', 'y', 'width', 'height']) {
      assert(
        Math.abs(initial.box[property] - current.box[property]) < 0.02,
        `${initial.name} 的 ${property} 发生变化：${initial.box[property]} → ${current.box[property]}`,
      )
    }
    assert.deepEqual(current.layout, initial.layout, `${initial.name} 的盒模型或字体状态变化`)
  }
}

/** 读取页头及可见后代的实际位置、尺寸与影响布局的样式，隐藏元素不参与几何比较。 */
async function snapshot(page) {
  return page.locator('.workspace-landing-header').evaluate((root) =>
    [root, ...root.querySelectorAll('*')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          name:
            element.getAttribute('aria-label') || element.className?.baseVal || element.className,
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
          layout: {
            padding: style.padding,
            margin: style.margin,
            borderWidth: style.borderWidth,
            borderStyle: style.borderStyle,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            display: style.display,
            transform: style.transform,
            boxShadow: style.boxShadow,
          },
        }
      }),
  )
}

/** 按帧读取动画过程，验证中间帧而非只对比动画两端。 */
async function sampleFrames(page) {
  const samples = []
  for (let index = 0; index < 18; index += 1) {
    await page.evaluate(() => new Promise(requestAnimationFrame))
    samples.push(await snapshot(page))
  }
  return samples
}

/** 从页头中央空白处进入或离开按钮，避免把工作空间卡片的上浮动效归因于页头。 */
async function moveToHeaderGap(page) {
  const position = await page.locator('.workspace-landing-header').evaluate((header) => {
    const brand = header.firstElementChild.getBoundingClientRect()
    const actions = header.lastElementChild.getBoundingClientRect()
    const box = header.getBoundingClientRect()
    return { x: (brand.right + actions.left) / 2, y: box.y + box.height / 2 }
  })
  await page.mouse.move(position.x, position.y)
  await page.waitForTimeout(240)
}

/** 使用 Chromium 布局计数衡量纯 hover 区间；此时不采样 DOM，避免强制测量干扰结果。 */
async function layoutDelta(session, page, position) {
  const before = await session.send('Performance.getMetrics')
  await page.mouse.move(position.x, position.y)
  await page.waitForTimeout(240)
  const after = await session.send('Performance.getMetrics')
  const metric = (result, name) => result.metrics.find((item) => item.name === name).value
  return {
    layoutCount: metric(after, 'LayoutCount') - metric(before, 'LayoutCount'),
    recalcStyleCount: metric(after, 'RecalcStyleCount') - metric(before, 'RecalcStyleCount'),
  }
}

/** 用全 mock API 验证头部 hover、离开和键盘焦点，不读取现有登录态或调用真实业务服务。 */
async function scenario({
  name,
  width,
  reducedMotion = 'no-preference',
  english,
  empty,
  longName,
}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const unexpected = []
  const pageErrors = []
  const identity = longName ? { ...user, name: '测试用户拥有很长的展示姓名用于验证账户菜单' } : user
  await context.addCookies([{ name: 'token', value: 'qa-only-noncredential', url: baseUrl }])
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const body = fixtureResponse(url, empty ? 'empty-workspaces' : 'filled')
    if (request.method() !== 'GET' || body === undefined) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.fulfill({ status: 501, json: { message: '验证中未配置的 API' } })
    }
    return route.fulfill({
      status: 200,
      json: url.pathname === '/api/workspaces' ? { ...body, user: identity } : body,
    })
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto(`${baseUrl}/workspaces`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: '选择工作空间' }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    if (english) {
      await page.getByRole('button', { name: '切换语言' }).click()
      await page.getByRole('menuitem', { name: 'English' }).click()
      await page.getByRole('heading', { name: 'Choose a Workspace' }).waitFor()
      await page.waitForTimeout(300)
    }
    const session = await context.newCDPSession(page)
    await session.send('Performance.enable')
    const targets = page.locator('.workspace-landing-actions > .ant-btn')
    assert.equal(await targets.count(), 2)
    const details = []
    for (let index = 0; index < 2; index += 1) {
      await moveToHeaderGap(page)
      const target = targets.nth(index)
      const initial = await snapshot(page)
      const css = await target.evaluate((element) => {
        const style = getComputedStyle(element)
        return { transition: style.transitionProperty, background: style.backgroundColor }
      })
      assert.deepEqual(
        css.transition
          .split(',')
          .map((value) => value.trim())
          .sort(),
        ['background-color', 'border-color', 'color'],
      )
      assert.equal(css.background, 'rgba(0, 0, 0, 0)')
      const box = await target.boundingBox()
      const position = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const enterMetrics = await layoutDelta(session, page, position)
      assert.equal(enterMetrics.layoutCount, 0, '纯 hover 区间发生布局')
      checkStable(initial, await snapshot(page))
      const hoveredBackground = await target.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      )
      assert.notEqual(hoveredBackground, css.background, 'hover 颜色反馈消失')
      await moveToHeaderGap(page)
      await page.mouse.move(position.x, position.y)
      for (const frame of await sampleFrames(page)) checkStable(initial, frame)
      await moveToHeaderGap(page)
      checkStable(initial, await snapshot(page))
      const initialBorder = await target.evaluate(
        (element) => getComputedStyle(element).borderColor,
      )
      await page.keyboard.press('Tab')
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (await target.evaluate((element) => element === document.activeElement)) break
        await page.keyboard.press('Tab')
      }
      assert(
        await target.evaluate((element) => element === document.activeElement),
        '键盘未定位入口',
      )
      assert(
        await target.evaluate(
          (element) =>
            element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none',
        ),
        '键盘焦点不可见',
      )
      for (const frame of await sampleFrames(page)) checkStable(initial, frame)
      await page.mouse.move(position.x, position.y)
      await page.mouse.down()
      assert(await target.evaluate((element) => element.matches(':active')), '按下状态未生效')
      for (const frame of await sampleFrames(page)) checkStable(initial, frame)
      const pressedBackground = await target.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      )
      assert.notEqual(pressedBackground, hoveredBackground, '按下颜色反馈消失')
      await moveToHeaderGap(page)
      await page.mouse.up()
      details.push({
        target: await target.getAttribute('aria-label'),
        enterMetrics,
        transition: css.transition,
        initialBorder,
        sampledFrames: 54,
        hoverFeedback: true,
        keyboardFocus: true,
        pressedFeedback: true,
      })
      await target.evaluate((element) => element.blur())
    }
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      '页头横向溢出',
    )
    assert.deepEqual(unexpected, [])
    assert.deepEqual(pageErrors, [])
    report.checks.push({
      name,
      width,
      reducedMotion,
      english: !!english,
      empty: !!empty,
      longName: !!longName,
      details,
      passed: true,
    })
    console.log(`PASS ${name}`)
  } catch (error) {
    report.failures.push({ name, message: error.message, unexpected, pageErrors })
    console.error(`FAIL ${name}: ${error.message}`)
  } finally {
    await context.close()
  }
}

try {
  await scenario({ name: 'desktop', width: 1440 })
  await scenario({ name: 'desktop-reduced-motion', width: 1440, reducedMotion: 'reduce' })
  await scenario({ name: 'mobile', width: 390 })
  await scenario({ name: 'narrow', width: 320 })
  await scenario({ name: 'long-name', width: 320, longName: true })
  await scenario({ name: 'empty-workspaces', width: 390, empty: true })
  await scenario({ name: 'english', width: 1440, english: true })
} finally {
  await mkdir(reportRoot, { recursive: true })
  await writeFile(
    resolve(reportRoot, 'hover-stability.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
console.log(`完成：${report.checks.length} 通过，${report.failures.length} 失败`)
process.exitCode = report.failures.length ? 1 : 0
