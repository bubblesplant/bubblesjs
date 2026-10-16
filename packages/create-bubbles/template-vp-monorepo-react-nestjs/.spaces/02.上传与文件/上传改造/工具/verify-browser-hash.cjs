const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')
const { createRequire } = require('node:module')

/** 在本地静态服务器运行生产构建，独立用 Node crypto 验证浏览器结果。 */
async function main() {
  const dist = path.resolve(process.argv[2])
  const requireBrowser = process.env.CODEX_BROWSER_MODULE_DIR
    ? createRequire(path.join(process.env.CODEX_BROWSER_MODULE_DIR, 'package.json'))
    : require
  const { chromium } = requireBrowser('playwright')
  const errors = []
  const server = http.createServer(async (request, response) => {
    try {
      const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const relativePath = urlPath === '/' ? 'browser-hash-probe.html' : urlPath.slice(1)
      const filePath = path.resolve(dist, relativePath)
      if (!filePath.startsWith(`${dist}${path.sep}`)) throw new Error('Invalid path')
      response.setHeader(
        'content-type',
        filePath.endsWith('.html') ? 'text/html' : 'text/javascript',
      )
      response.end(await fs.readFile(filePath))
    } catch {
      response.writeHead(404).end()
    }
  })
  let browser
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    browser = await chromium.launch({ headless: true, channel: 'msedge' })
    const page = await browser.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    const port = server.address().port
    await page.goto(`http://127.0.0.1:${port}/`)
    await page.waitForFunction(() => typeof globalThis.runFileHashProbe === 'function')
    const result = await page.evaluate(() => globalThis.runFileHashProbe())
    for (const item of result.results) {
      const bytes = Uint8Array.from({ length: item.size }, (_, index) => index % 256)
      assert.equal(item.sha256, createHash('sha256').update(bytes).digest('hex'))
      assert.equal(item.progress[0], 0)
      assert.equal(item.progress.at(-1), item.size)
      assert.ok(
        item.progress.every((value, index, values) => index === 0 || value >= values[index - 1]),
      )
    }
    const reference = createHash('sha256')
    const zeroChunk = Buffer.alloc(1024 * 1024)
    for (let index = 0; index < 64; index += 1) reference.update(zeroChunk)
    assert.equal(result.largeSha256, reference.digest('hex'))
    assert.equal(result.recoverySha256, createHash('sha256').update('abc').digest('hex'))
    assert.equal(result.runningCancel, 'AbortError')
    assert.equal(result.queuedCancel, 'AbortError')
    assert.equal(result.callbackError, 'probe-callback-error')
    assert.equal(result.activeWorkers, 0)
    assert.equal(result.maxActiveWorkers, 2)
    assert.equal(result.createdWorkers, result.terminatedWorkers)
    assert.equal(result.createdWorkers, 8)
    assert.ok(result.heartbeatCount > 0)
    assert.deepEqual(errors, [])
    const evidence = {
      status: 'passed',
      browser: await browser.version(),
      mode: 'production build; real Web Worker + hash-wasm',
      ...result,
      pageErrors: errors,
      limitations: '本地生成 Blob；没有真实磁盘大文件、上传接口或 90 GiB 性能测试。心跳是采样值。',
    }
    await fs.writeFile(
      path.join(__dirname, '../测试证据/前端浏览器摘要.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
    )
    console.log(JSON.stringify(evidence, null, 2))
  } finally {
    if (browser) await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
