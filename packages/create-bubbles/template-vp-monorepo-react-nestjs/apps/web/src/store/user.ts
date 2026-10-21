import { create } from 'zustand'
import type { AccessContext, WorkspaceEntry, WorkspacesResult } from 'shared/types'
import { getWorkspaceUser, getWorkspaces } from '@/pages/workspaces/api'
import { cookie } from '@/utils/storage/cookie'
import {
  readWorkspaceSnapshot,
  removeWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  WORKSPACES_STORAGE_KEY,
} from './user/persistence'
import { waitForWorkspaces } from './user/waiting'

type WorkspaceAccess = AccessContext & { workspace?: WorkspaceEntry }

interface WorkspaceState {
  workspaces?: WorkspacesResult
  accessByScope: Map<string, WorkspaceAccess>
  status: 'idle' | 'restored' | 'ready' | 'stale' | 'error'
  loading: boolean
  updatedAt: number
  error?: unknown
}

interface UserStore extends WorkspaceState {
  /** 同步 Cookie 会话，退出或换号时清理旧状态并中止在途操作。 */
  syncSession: () => void
  /** 复用有效结果并合并在途请求；单个消费者取消不影响共享请求。 */
  ensureWorkspaces: (options?: {
    signal?: AbortSignal
    refresh?: boolean
    allowRestored?: boolean
  }) => Promise<WorkspacesResult>
  /** 标记列表失效，使开始于业务变更之前的响应触发补取。 */
  invalidateWorkspaces: () => void
  /** 从具体空间返回选择页时刷新，默认入口内部跳转复用列表。 */
  visitWorkspace: (key: string) => void
  /** 用新 Map 发布空间权限，使 Zustand 订阅者收到更新。 */
  setWorkspaceAccess: (key: string, access: WorkspaceAccess) => void
  /** 清除失败空间的旧权限并通知订阅者。 */
  removeWorkspaceAccess: (key: string) => void
}

interface WorkspaceOperation {
  controller: AbortController
  promise: Promise<WorkspacesResult>
  restored: Promise<WorkspacesResult | undefined>
}

/** 清空会话数据时显式重置可选字段，保留 Zustand 中的动作。 */
function emptyState(): WorkspaceState {
  return {
    workspaces: undefined,
    accessByScope: new Map(),
    status: 'idle',
    loading: false,
    updatedAt: 0,
    error: undefined,
  }
}

/** 用户与工作空间的唯一全局 store；组件使用 hook，路由使用 getState() 调用动作。 */
export const useUserStore = create<UserStore>((set, get) => {
  let session: string | null | undefined
  let revision = 0
  let activeScope = ''
  let restorationAttempted = false
  let pending: WorkspaceOperation | undefined

  /** 使旧操作和权限失效；首次启动保留快照，待服务端核对身份后恢复。 */
  function resetSession(removeSnapshot: boolean) {
    pending?.controller.abort()
    pending = undefined
    revision += 1
    activeScope = ''
    restorationAttempted = false
    if (removeSnapshot) removeWorkspaceSnapshot()
    set(emptyState())
  }

  /** 读写 Cookie 的统一入口之外，也在请求开始前核对当前会话。 */
  function syncSession() {
    const token = cookie.get('token')
    if (session === token) return
    const hadSession = session !== undefined
    session = token
    resetSession(hadSession || !token)
  }

  /** 业务变更推进版本，防止旧列表响应吞掉较晚的刷新事件。 */
  function invalidateWorkspaces() {
    syncSession()
    revision += 1
    set({ status: 'stale' })
  }

  /** 恢复展示快照后获取最新列表；会话变化或取消阻止迟到结果回写。 */
  async function loadWorkspaces(input: {
    controller: AbortController
    token: string
    restored: (data?: WorkspacesResult) => void
  }) {
    const { controller, token, restored } = input
    /** 路由切换保留共享获取，换号和退出使整个旧操作失效。 */
    const assertCurrent = () => {
      if (controller.signal.aborted || token !== cookie.get('token'))
        throw new DOMException('登录会话已变化', 'AbortError')
    }
    try {
      assertCurrent()
      if (!restorationAttempted) {
        restorationAttempted = true
        const snapshot = readWorkspaceSnapshot()
        if (snapshot) {
          const user = await getWorkspaceUser({ signal: controller.signal })
          assertCurrent()
          if (snapshot.userId === user.id) {
            const data = { user, workspaces: snapshot.workspaces }
            set({ workspaces: data, status: 'restored', updatedAt: snapshot.savedAt })
            restored(data)
          } else removeWorkspaceSnapshot()
        }
      }
      restored()
      while (true) {
        const startedAt = revision
        try {
          const data = await getWorkspaces({ signal: controller.signal })
          assertCurrent()
          if (startedAt !== revision) continue
          const updatedAt = Date.now()
          set({ workspaces: data, status: 'ready', updatedAt, error: undefined })
          saveWorkspaceSnapshot(data, updatedAt)
          return data
        } catch (error) {
          assertCurrent()
          if (startedAt !== revision) continue
          throw error
        }
      }
    } catch (error) {
      restored()
      assertCurrent()
      set({ workspaces: undefined, status: 'error', error })
      throw error
    }
  }

  /** 会话写入或删除时立即清理，避免首次读取前的换号继承展示快照。 */
  function sessionChanged() {
    if (session === undefined) {
      session = cookie.get('token')
      resetSession(true)
    } else syncSession()
  }

  /** 跨标签页会话变化后清理并刷新路由，同账号正常写回不触发刷新循环。 */
  function storageChanged(event: StorageEvent) {
    if (event.key !== null && event.key !== WORKSPACES_STORAGE_KEY) return
    if (cookie.get('token') !== session) syncSession()
    else if (event.newValue === null) resetSession(false)
    else return
    window.dispatchEvent(new Event('workspace-access-refresh'))
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('auth-session-change', sessionChanged)
    window.addEventListener('storage', storageChanged)
    window.addEventListener('workspace-access-refresh', invalidateWorkspaces)
    import.meta.hot?.dispose(() => {
      pending?.controller.abort()
      window.removeEventListener('auth-session-change', sessionChanged)
      window.removeEventListener('storage', storageChanged)
      window.removeEventListener('workspace-access-refresh', invalidateWorkspaces)
    })
  }

  return {
    ...emptyState(),
    syncSession,
    invalidateWorkspaces,
    /** 默认分流不重复刷新；从具体空间返回时校验列表变更。 */
    visitWorkspace(key) {
      syncSession()
      if (key === 'workspaces' && activeScope && activeScope !== key) invalidateWorkspaces()
      activeScope = key
    },
    /** 权限只留在内存，通过不可变更新通知使用 selector 的组件。 */
    setWorkspaceAccess(key, access) {
      syncSession()
      set((state) => ({ accessByScope: new Map(state.accessByScope).set(key, access) }))
    },
    /** 移除空间旧授权时保留其他空间数据与原 Map 快照。 */
    removeWorkspaceAccess(key) {
      syncSession()
      set((state) => {
        const accessByScope = new Map(state.accessByScope)
        accessByScope.delete(key)
        return { accessByScope }
      })
    },
    /**
     * 空数组也可复用；首次读取和刷新合并为会话共享请求。
     * 选择页可先展示核对过身份的快照，默认分流等待最新结果。
     */
    ensureWorkspaces(options = {}) {
      syncSession()
      if (options.signal?.aborted)
        return Promise.reject(new DOMException('导航已取消', 'AbortError'))
      if (options.refresh && !pending) invalidateWorkspaces()
      const state = get()
      if (state.status === 'ready' && state.workspaces && !pending)
        return Promise.resolve(state.workspaces)
      if (!pending) {
        const token = session
        if (!token) return Promise.reject(new DOMException('尚未登录', 'AbortError'))
        const controller = new AbortController()
        let restored!: (data?: WorkspacesResult) => void
        const restoredPromise = new Promise<WorkspacesResult | undefined>((resolve) => {
          restored = resolve
        })
        const operation: WorkspaceOperation = {
          controller,
          restored: restoredPromise,
          promise: Promise.resolve().then(() => loadWorkspaces({ controller, token, restored })),
        }
        pending = operation
        set({ loading: true, error: undefined })
        /** 旧会话结束不能关闭新会话的加载状态。 */
        const complete = () => {
          if (pending !== operation) return
          pending = undefined
          set({ loading: false })
        }
        void operation.promise.then(complete, complete)
      }
      const operation = pending
      const result = options.allowRestored
        ? Promise.race([
            operation.promise,
            operation.restored.then((data) => data ?? operation.promise),
          ])
        : operation.promise
      return waitForWorkspaces(result, options.signal)
    },
  }
})

useUserStore.getState().syncSession()
