import { describe, expect, it, vi } from 'vite-plus/test'
import { createLatestDialogRequestController } from '../src/hooks/useLatestDialogRequest'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

/** 创建可由测试控制完成时机的 Promise。 */
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

/** 创建记录成功与失败回调的弹窗请求参数。 */
function requestOptions(
  targetId: string,
  request: Deferred<string>,
  opened: string[],
  onError = vi.fn(),
) {
  return {
    targetId,
    load: () => request.promise,
    onSuccess: (result: string) => opened.push(result),
    onError,
  }
}

describe('最新弹窗请求协调器', () => {
  it('A 慢 B 快时只允许 B 打开弹窗', async () => {
    const loading: Array<string | undefined> = []
    const opened: string[] = []
    const first = deferred<string>()
    const second = deferred<string>()
    const controller = createLatestDialogRequestController((targetId) => loading.push(targetId))

    const firstRun = controller.run(requestOptions('A', first, opened))
    const secondRun = controller.run(requestOptions('B', second, opened))
    second.resolve('B')
    await secondRun
    first.resolve('A')
    await firstRun

    expect(opened).toEqual(['B'])
    expect(loading).toEqual(['A', 'B', undefined])
  })

  it('A 的旧 finally 不会清除仍在加载的 B', async () => {
    const loading: Array<string | undefined> = []
    const opened: string[] = []
    const first = deferred<string>()
    const second = deferred<string>()
    const controller = createLatestDialogRequestController((targetId) => loading.push(targetId))

    const firstRun = controller.run(requestOptions('A', first, opened))
    const secondRun = controller.run(requestOptions('B', second, opened))
    first.resolve('A')
    await firstRun

    expect(opened).toEqual([])
    expect(loading).toEqual(['A', 'B'])

    second.resolve('B')
    await secondRun
    expect(opened).toEqual(['B'])
    expect(loading).toEqual(['A', 'B', undefined])
  })

  it('失效后的请求不再执行成功或失败回调', async () => {
    const loading: Array<string | undefined> = []
    const opened: string[] = []
    const pending = deferred<string>()
    const onError = vi.fn()
    const controller = createLatestDialogRequestController((targetId) => loading.push(targetId))

    const run = controller.run(requestOptions('A', pending, opened, onError))
    controller.invalidate()
    pending.resolve('A')
    await run

    expect(opened).toEqual([])
    expect(onError).not.toHaveBeenCalled()
    expect(loading).toEqual(['A'])
  })
})
