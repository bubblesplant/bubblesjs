import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const {
  chromium,
} = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const uiRoot = resolve(featureRoot, 'ui/selector-layout')
const browser = await chromium.launch({ channel: 'msedge', headless: true })

try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1.5,
  })
  await page.goto(pathToFileURL(resolve(uiRoot, '选择器样式提案.html')).href)
  await page.evaluate(() => document.fonts.ready)
  const metrics = await page.locator('.selected-scroll .chip').evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }),
  )
  assert.equal(metrics.length, 12)
  assert(metrics.some((item, index) => index > 0 && item.y === metrics[index - 1].y))
  assert(metrics.some((item) => item.y > metrics[0].y))
  const output = resolve(uiRoot, '选择器样式提案.png')
  await page.locator('.board').screenshot({ path: output })
  console.log(JSON.stringify({ output, width: 2400, shortTagsFlowAndWrap: true }))
} finally {
  await browser.close()
}
