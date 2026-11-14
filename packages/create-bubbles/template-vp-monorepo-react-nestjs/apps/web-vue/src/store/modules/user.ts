import type { AccessContext, AccessScope, UserSummary, WorkspaceEntry } from 'shared/types'
import { defineStore } from 'pinia'
import { accessScopeKey } from 'shared/utils'
import { onScopeDispose, ref, shallowRef } from 'vue'
import { clearWorkspaceRequests, enterWorkspace } from '@/utils/request/workspace'
import { cookie } from '@/utils/storage/cookie'
import { getAccessContext, getWorkspaces } from '@/views/workspaces/api'
import { store } from '..'

/** 仅保存服务端验证过的身份和权限，不持久化授权。 */
export const useUserStore = defineStore('user', () => {
  const user = shallowRef<UserSummary | null>(null)
  const workspaces = shallowRef<WorkspaceEntry[]>([])
  const access = shallowRef<AccessContext | null>(null)
  const ready = ref(false)
  let pending: Promise<void> | undefined
  let revision = 0
  let sessionToken = cookie.get('token')
  let accessRevision = 0
  let accessPending:
    | { key: string; promise: Promise<AccessContext>; controller: AbortController }
    | undefined

  /** 会话变化时撤销内存身份、授权和在途请求。 */
  function reset() {
    revision += 1
    sessionToken = cookie.get('token')
    accessRevision += 1
    accessPending?.controller.abort()
    accessPending = undefined
    user.value = null
    workspaces.value = []
    access.value = null
    ready.value = false
    pending = undefined
    clearWorkspaceRequests()
  }

  /** 合并同一会话的空间请求，拒绝另一个账号的迟到结果。 */
  async function loadWorkspaces(force = false) {
    if (sessionToken !== cookie.get('token')) reset()
    if (ready.value && !force) return
    if (pending) return pending
    const startedAt = revision
    const request = getWorkspaces({}).then((result) => {
      if (startedAt !== revision) throw new DOMException('会话已变化', 'AbortError')
      user.value = result.user
      workspaces.value = result.workspaces
      ready.value = true
    })
    pending = request
    try {
      await request
    } finally {
      if (pending === request) pending = undefined
    }
  }

  /** 进入空间后读取最新授权；切换时中止旧空间管理请求。 */
  async function loadAccess(scope: AccessScope, force = false) {
    if (sessionToken !== cookie.get('token')) reset()
    const key = accessScopeKey(scope)
    if (!force && accessPending?.key === key) return accessPending.promise
    if (!force && access.value && accessScopeKey(access.value.scope) === key) return access.value
    accessPending?.controller.abort()
    const startedAt = ++accessRevision
    const token = sessionToken
    const controller = new AbortController()
    access.value = null
    enterWorkspace(key)
    const promise = getAccessContext(scope, { workspaceKey: key, signal: controller.signal }).then(
      (result) => {
        if (
          startedAt !== accessRevision ||
          token !== cookie.get('token') ||
          controller.signal.aborted
        )
          throw new DOMException('空间授权已过期', 'AbortError')
        access.value = result
        return result
      },
    )
    accessPending = { key, promise, controller }
    try {
      return await promise
    } finally {
      if (accessPending?.promise === promise) accessPending = undefined
    }
  }

  /** 离开管理空间时撤销授权与在途请求，保留空间列表。 */
  function leaveWorkspace() {
    accessRevision += 1
    accessPending?.controller.abort()
    accessPending = undefined
    access.value = null
    clearWorkspaceRequests()
  }

  window.addEventListener('auth-session-change', reset)
  /** 聚焦时重新校验被其他标签删除或替换的会话。 */
  function checkSession() {
    const token = cookie.get('token')
    if (token === sessionToken) return
    window.dispatchEvent(new Event('auth-session-change'))
    window.dispatchEvent(new Event(token ? 'auth-session-recheck' : 'auth-unauthorized'))
  }
  window.addEventListener('focus', checkSession)
  /** 释放 store 时同步移除全局监听，避免重复实例累积事件处理。 */
  function dispose() {
    accessPending?.controller.abort()
    window.removeEventListener('auth-session-change', reset)
    window.removeEventListener('focus', checkSession)
  }
  onScopeDispose(dispose)
  import.meta.hot?.dispose(dispose)
  return {
    user,
    workspaces,
    access,
    ready,
    reset,
    loadWorkspaces,
    loadAccess,
    leaveWorkspace,
  }
})

/** 在组件外显式使用应用的 Pinia。 */
export function useUserStoreWithOut() {
  return useUserStore(store)
}
