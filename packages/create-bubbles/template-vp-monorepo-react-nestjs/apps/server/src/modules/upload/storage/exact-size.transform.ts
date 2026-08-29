import { TransformCallback } from 'node:stream'
import { Transform } from 'stream'

export class ExactSizeError extends Error {
  constructor(
    readonly expectedBytes: number,
    readonly receivedBytes: number,
  ) {
    super(`Expected ${expectedBytes} bytes, recevied ${receivedBytes}`)
    this.name = ExactSizeError.name
  }
}

export class ExactSizeTransform extends Transform {
  receivedBytes = 0

  constructor(private readonly expectedBytes: number) {
    super()
  }

  override _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    const byteLength = Buffer.isBuffer(chunk)
      ? chunk.length
      : Buffer.byteLength(String(chunk), encoding)
    this.receivedBytes += byteLength

    if (this.receivedBytes > this.expectedBytes) {
      callback(new ExactSizeError(this.expectedBytes, this.receivedBytes))
      return
    }

    callback(null, chunk)
  }

  /**
   * 出场质检
   * @param callback
   * @returns
   */
  override _flush(callback: TransformCallback): void {
    if (this.receivedBytes !== this.expectedBytes) {
      callback(new ExactSizeError(this.expectedBytes, this.receivedBytes))
      return
    }

    callback()
  }
}

export function findExactSizeError(cause: unknown): ExactSizeError | null {
  let current = cause

  for (let depth = 0; depth < 8; depth += 1) {
    if (current instanceof ExactSizeError) {
      return current
    }

    if (typeof current !== 'object' || current === null || !('cause' in current)) {
      return null
    }

    current = current.cause
  }

  return null
}
