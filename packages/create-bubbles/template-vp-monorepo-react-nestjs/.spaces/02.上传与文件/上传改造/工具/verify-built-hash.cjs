const assert = require('node:assert/strict')
const { resolve } = require('node:path')
const { Readable } = require('node:stream')
const { createHash } = require('node:crypto')
const { performance, monitorEventLoopDelay } = require('node:perf_hooks')

/** 按需生成 1 GiB 数据，不创建大文件或大数组；记录内存样本与主线程调度延迟。 */
async function measureStream(service) {
  const block = Buffer.alloc(256 * 1024, 'a')
  const blocks = 4096
  const reference = createHash('sha256')
  for (let i = 0; i < blocks; i += 1) reference.update(block)
  const expected = reference.digest('hex')
  const baselineRss = process.memoryUsage().rss
  const samples = []
  const delay = monitorEventLoopDelay({ resolution: 20 })
  delay.enable()
  const started = performance.now()
  const sha256 = await service.calculate({
    expectedSize: block.length * blocks,
    openStream: async () =>
      Readable.from(
        (async function* () {
          for (let i = 0; i < blocks; i += 1) {
            if (i % 256 === 0)
              samples.push({ processedMiB: i / 4, rssMiB: process.memoryUsage().rss / 1024 ** 2 })
            yield block
          }
        })(),
      ),
  })
  delay.disable()
  assert.equal(sha256, expected)
  return {
    bytes: block.length * blocks,
    sha256,
    elapsedMs: Math.round(performance.now() - started),
    baselineRssMiB: baselineRss / 1024 ** 2,
    sampledPeakRssMiB: Math.max(...samples.map((sample) => sample.rssMiB)),
    eventLoopMaxDelayMs: delay.max / 1e6,
    samples,
  }
}

/** 使用生产构建产物启动真实 Worker，验证资产路径与原生摘要，完全不连接外部服务。 */
async function verify() {
  const { ContentHashService } = require(
    resolve(__dirname, '../../../../apps/server/dist/modules/upload/hash/content-hash.service.js'),
  )
  const service = new ContentHashService()
  try {
    const sha256 = await service.calculate({
      expectedSize: 3,
      openStream: async () => Readable.from([Buffer.from('a'), Buffer.from('bc')]),
    })
    assert.equal(sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const stream = process.argv.includes('--stream') ? await measureStream(service) : undefined
    process.stdout.write(
      `${JSON.stringify({ status: 'passed', source: 'production-build', sha256, stream })}\n`,
    )
  } finally {
    await service.onModuleDestroy()
  }
}

verify().catch((cause) => {
  process.stderr.write(`${cause.stack}\n`)
  process.exitCode = 1
})
