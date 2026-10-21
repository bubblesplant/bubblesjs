import { afterEach, beforeEach, vi } from 'vite-plus/test'
import type { WorkspacesResult } from 'shared/types'
import { cookie } from '../../src/utils/storage/cookie'

const api = vi.hoisted(() => ({ getWorkspaces: vi.fn(), getWorkspaceUser: vi.fn() }))
export { api }
vi.mock('../../src/pages/workspaces/api', () => api)

export const storageKey = 'workspace-display-cache'
export const user = { id: 'user-one', name: '演示用户', account: 'demo_member' }
export const data: WorkspacesResult = {
  user,
  workspaces: [
    {
      scope: { type: 'company', companyId: 'company-one' },
      name: '演示企业',
      administrator: 'company',
    },
  ],
}
export let store: (typeof import('../../src/store/user'))['useUserStore']

/** 控制服务端响应时间，复现并发、撤权和换号竞态。 */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

/** 写入上次会话留下的最小展示快照，模拟整页刷新前的数据。 */
export function seedSnapshot() {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: 1,
      userId: user.id,
      savedAt: Date.now(),
      workspaces: data.workspaces.map(({ administrator: _administrator, ...entry }) => entry),
    }),
  )
}

const registrations: Array<{ name: string; callback: EventListenerOrEventListenerObject }> = []
beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  cookie.set('token', 'session-one')
  api.getWorkspaces.mockReset().mockResolvedValue(data)
  api.getWorkspaceUser.mockReset().mockResolvedValue(user)
  const add = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((name, callback, options) => {
    registrations.push({ name, callback })
    add(name, callback, options)
  })
  store = (await import('../../src/store/user')).useUserStore
})

afterEach(() => {
  cookie.remove('token')
  for (const { name, callback } of registrations) window.removeEventListener(name, callback)
  registrations.length = 0
  vi.restoreAllMocks()
})
