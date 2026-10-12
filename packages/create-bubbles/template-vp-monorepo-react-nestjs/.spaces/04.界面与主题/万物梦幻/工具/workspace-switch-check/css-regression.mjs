import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installFixtures, workspaceEntries } from './fixtures.mjs'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const phase = process.argv[2] || 'before'
const baseUrl = process.argv[3] || 'http://127.0.0.1:9999'
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const report = { phase, executedAt: new Date().toISOString(), baseUrl, scenarios: [] }

/** 仅改写浏览器收到的入口响应，把CSS模拟为App之后导入，源文件保持原样。 */
function rewriteEntryImports(original) {
  const cssPattern = /import\s+["']\/src\/styles\/(?:index|dream)\.css(?:\?[^"']*)?["'];?/g
  const cssImports = [...original.matchAll(cssPattern)].map(([statement]) => statement)
  assert.equal(cssImports.length, 2, '无法识别两个入口CSS导入，模拟不能继续')
  const transformed = original.replace(cssPattern, '').split('\n')
  const lastImport = transformed.findLastIndex((line) => /^import\s/.test(line))
  transformed.splice(
    lastImport + 1,
    0,
    ...cssImports.sort((left, right) => left.localeCompare(right)),
  )
  const imports = /import\s+[^;\n]+;?/g
  const evidence = {
    interceptedPath: '/src/main.tsx',
    originalImports: [...original.matchAll(imports)].map(([statement]) => statement),
    simulatedImports: [...transformed.join('\n').matchAll(imports)].map(([statement]) => statement),
    cssMovedAfterApp:
      transformed.findIndex((line) => line.includes('/src/App.tsx')) <
      transformed.findIndex((line) => cssImports.includes(line)),
  }
  assert(evidence.cssMovedAfterApp, 'CSS未移动到App导入之后')
  return { body: transformed.join('\n'), evidence }
}

/** 在全新上下文中记录实际样式加载，登录页无mock且不提交任何凭据。 */
async function captureScenario({
  name,
  path,
  mock,
  width = 1440,
  navigate = false,
  reorderImports = false,
}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } })
  const fixtures = mock
    ? await installFixtures({ context, baseUrl, entries: workspaceEntries })
    : null
  let importSimulation = null
  if (reorderImports) {
    /** 拦截入口脚本的本地响应，改写导入顺序并保留验证证据。 */
    await context.route('**/src/main.tsx*', async (route) => {
      const response = await route.fetch()
      try {
        const { body, evidence } = rewriteEntryImports(await response.text())
        importSimulation = evidence
        await route.fulfill({ response, body })
      } catch (error) {
        importSimulation = { failed: error.message }
        await route.fulfill({ response })
      }
    })
  }
  await context.addInitScript(() => {
    window.__styleAppearance = []
    const seen = new WeakSet()
    /** 只记样式节点的技术标识和首段CSS，避免采集业务DOM或凭据。 */
    const record = (node) => {
      if (!(node instanceof Element)) return
      for (const element of [node, ...node.querySelectorAll('style,link[rel="stylesheet"]')]) {
        if (!element.matches('style,link[rel="stylesheet"]') || seen.has(element)) continue
        seen.add(element)
        window.__styleAppearance.push({
          at: performance.now(),
          tag: element.tagName,
          viteId: element.getAttribute('data-vite-dev-id'),
          href: element.getAttribute('href'),
          hash: element.getAttribute('data-css-hash'),
          start: element.textContent.slice(0, 160),
        })
      }
    }
    new MutationObserver((entries) => {
      for (const entry of entries) for (const node of entry.addedNodes) record(node)
    }).observe(document, { childList: true, subtree: true })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' })
    if (navigate) {
      await page.locator('.workspace-switch').click()
      await page.waitForURL('**/workspaces')
      await page.locator('.workspace-return-current').waitFor()
      assert.equal(
        await page.locator('.workspace-return-current').getAttribute('href'),
        '/companies/qa-company',
      )
      await page.waitForLoadState('networkidle')
    }
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(600)
    const cssom = await page.evaluate(() => {
      const selectors = [
        'html',
        'body',
        '#root',
        'h1',
        'button',
        '.ant-btn-primary',
        '.ant-btn-default',
        '.workspace-landing',
        '.workspace-landing-header',
        '.workspace-landing-main',
        'main',
        '.workspace-page-title',
        '.workspace-page-title h1',
        '.workspace-card',
        '.workspace-card .ant-card-body',
        '.workspace-card h2',
        '.workspace-card h3',
        '.workspace-card .ant-card-head-title',
        '.ant-pro-global-header',
        '.ant-pro-layout',
        '.ant-pro-layout-container',
        '.ant-pro-layout-content',
        '.workspace-body',
        '.ant-input-affix-wrapper',
        '.ant-input-affix-wrapper .ant-input',
      ]
      const properties = [
        'margin',
        'padding',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'background',
        'background-color',
        'background-image',
        'border-width',
        'border-style',
        'border-color',
        'border-radius',
        'box-shadow',
        'color',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'box-sizing',
        'display',
        'width',
        'height',
      ]
      const elements = selectors
        .map((selector) => ({ selector, element: document.querySelector(selector) }))
        .filter((item) => item.element)
      const computed = elements.map(({ selector, element }) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return {
          selector,
          class: element.className,
          box: [box.x, box.y, box.width, box.height],
          style: Object.fromEntries(
            properties.map((property) => [property, style.getPropertyValue(property)]),
          ),
          matchingRules: [],
        }
      })
      const sheets = []
      const declarations = []
      /** 遍历CSSOM而不改写页面，记录层声明、条件以及相关全局／组件规则。 */
      const visit = ({ rules, sheet, layers = [], conditions = [] }) => {
        for (const rule of rules) {
          const type = rule.constructor.name
          if (type === 'CSSLayerStatementRule' || type === 'CSSLayerBlockRule') {
            declarations.push({
              sheet,
              type,
              name: rule.name || null,
              text: rule.cssText.split('{')[0],
              layers,
            })
          }
          if (rule.selectorText && rule.style) {
            const css = Object.fromEntries(
              [...rule.style]
                .filter((property) =>
                  /^(margin|padding|background|border|box-shadow|color|font|line-height|box-sizing|display|height|width)/.test(
                    property,
                  ),
                )
                .map((property) => [
                  property,
                  rule.style.getPropertyValue(property) +
                    (rule.style.getPropertyPriority(property) ? ' !important' : ''),
                ]),
            )
            if (Object.keys(css).length) {
              for (const [index, { element }] of elements.entries()) {
                try {
                  if (element.matches(rule.selectorText)) {
                    computed[index].matchingRules.push({
                      sheet,
                      selector: rule.selectorText,
                      layers,
                      conditions,
                      css,
                    })
                  }
                } catch {}
              }
            }
          }
          if (rule.cssRules) {
            visit({
              rules: rule.cssRules,
              sheet,
              layers: type === 'CSSLayerBlockRule' ? [...layers, rule.name] : layers,
              conditions: rule.conditionText
                ? [
                    ...conditions,
                    {
                      text: rule.conditionText,
                      active:
                        type === 'CSSMediaRule' ? matchMedia(rule.conditionText).matches : null,
                    },
                  ]
                : conditions,
            })
          }
          if (rule.styleSheet) visit({ rules: rule.styleSheet.cssRules, sheet, layers, conditions })
        }
      }
      for (const [index, sheet] of [...document.styleSheets].entries()) {
        const owner = sheet.ownerNode
        const description = {
          index,
          viteId: owner?.getAttribute('data-vite-dev-id'),
          href: sheet.href,
          hash: owner?.getAttribute('data-css-hash'),
          start: owner?.textContent.slice(0, 160),
        }
        sheets.push(description)
        try {
          visit({ rules: sheet.cssRules, sheet: index })
        } catch (error) {
          description.readError = error.name
        }
      }
      return {
        styleAppearance: window.__styleAppearance,
        sheets,
        declarations,
        computed,
        language: document.documentElement.lang,
        viewportWidth: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }
    })
    const session = await context.newCDPSession(page)
    await session.send('DOM.enable')
    await session.send('CSS.enable')
    const { root } = await session.send('DOM.getDocument')
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'body',
    })
    let layers
    try {
      layers = await session.send('CSS.getLayersForNode', { nodeId })
    } catch (error) {
      layers = { unavailable: error.message }
    }
    await session.detach()
    await page.mouse.move(-1, -1)
    const imagePath = resolve(featureRoot, `ui/workspace-css-${phase}-${name}.png`)
    const buffer = await page.screenshot({
      path: imagePath,
      fullPage: true,
      animations: 'disabled',
    })
    report.scenarios.push({
      name,
      path,
      finalPath: new URL(page.url()).pathname,
      width,
      navigate,
      importSimulation,
      mock,
      errors,
      unexpectedApi: fixtures?.unexpected || [],
      layers,
      ...cssom,
      screenshot: {
        path: imagePath,
        bytes: buffer.length,
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      },
    })
    if (phase !== 'before') {
      assert.deepEqual(
        layers.rootLayer.subLayers
          .map((layer) => layer.name)
          .filter((name) => name !== 'properties'),
        ['theme', 'base', 'antd', 'antd-pro', 'components', 'utilities'],
        '冷加载CSS层序未恢复',
      )
      assert(cssom.scrollWidth <= width + 1, '页面横向溢出')
      assert.deepEqual(errors, [], '页面存在运行时异常')
      assert.deepEqual(fixtures?.unexpected || [], [], '存在未配置API')
      const heading = cssom.computed.find((item) => item.selector === 'h1')
      assert(parseFloat(heading.style['font-size']) > 20, '标题仍被重置为正文大小')
      const cardBody = cssom.computed.find(
        (item) => item.selector === '.workspace-card .ant-card-body',
      )
      if (cardBody) {
        for (const side of ['top', 'right', 'bottom', 'left']) {
          assert(parseFloat(cardBody.style[`padding-${side}`]) >= 20, '卡片内容间距仍被重置')
        }
      }
      if (reorderImports) {
        assert(importSimulation?.cssMovedAfterApp, '未成功拦截入口并改写导入顺序')
      }
      report.scenarios.at(-1).passed = true
    }
    console.log(
      JSON.stringify({
        name,
        layers,
        globalStyles: cssom.computed
          .filter((item) =>
            [
              'body',
              'h1',
              '.workspace-card .ant-card-body',
              '.ant-pro-layout-content',
              '.ant-input-affix-wrapper',
            ].includes(item.selector),
          )
          .map(({ matchingRules: _rules, ...item }) => item),
      }),
    )
  } finally {
    await context.close()
  }
}

try {
  await mkdir(resolve(featureRoot, 'ui'), { recursive: true })
  await mkdir(resolve(featureRoot, '测试证据'), { recursive: true })
  await captureScenario({ name: 'login', path: '/login', mock: false })
  await captureScenario({ name: 'workspaces', path: '/workspaces', mock: true })
  await captureScenario({ name: 'company', path: '/companies/qa-company', mock: true })
  if (phase === 'after') {
    await captureScenario({
      name: 'company-to-workspaces',
      path: '/companies/qa-company',
      mock: true,
      navigate: true,
    })
    await captureScenario({
      name: 'workspaces-narrow',
      path: '/workspaces',
      mock: true,
      width: 320,
    })
    await captureScenario({
      name: 'legacy-import-login',
      path: '/login',
      mock: false,
      reorderImports: true,
    })
  }
} catch (error) {
  report.failures = [{ error: error.message }]
  throw error
} finally {
  await writeFile(
    resolve(featureRoot, `测试证据/workspace-css-regression-${phase}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
