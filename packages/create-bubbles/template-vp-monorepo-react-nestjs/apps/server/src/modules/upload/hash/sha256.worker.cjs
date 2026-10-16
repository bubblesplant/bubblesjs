const { createHash } = require('node:crypto')
const { parentPort } = require('node:worker_threads')

const hash = createHash('sha256')
let byteLength = 0

/** 按消息顺序更新同一摘要实例，确认后主线程才能发送下一块。 */
parentPort.on('message', (message) => {
  if (message.type === 'update') {
    hash.update(message.chunk)
    byteLength += message.chunk.byteLength
    parentPort.postMessage({ type: 'updated' })
    return
  }

  if (message.type !== 'digest') {
    throw new Error('Unknown hash worker message')
  }

  parentPort.postMessage({ type: 'digest', sha256: hash.digest('hex'), byteLength })
  parentPort.close()
})
