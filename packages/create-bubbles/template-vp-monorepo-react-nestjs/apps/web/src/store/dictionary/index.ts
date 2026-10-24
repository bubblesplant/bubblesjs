import { useStore } from 'zustand'
import type { DictionaryOptionsRequest } from 'shared/types'
import { fetchDictionaryItems } from '@/pages/dictionaries/api'
import { cookie } from '@/utils/storage/cookie'
import { useUserStore } from '@/store/user'
import { WORKSPACES_STORAGE_KEY } from '@/store/user/persistence'
import { createDictionaryStore } from './core'
import {
  readDictionarySnapshot,
  removeDictionarySnapshot,
  saveDictionarySnapshot,
} from './persistence'

export const dictionaryStore = createDictionaryStore({
  session: () => cookie.get('token'),
  identity: () => useUserStore.getState().ensureWorkspaces(),
  fetch: fetchDictionaryItems,
  read: readDictionarySnapshot,
  save: saveDictionarySnapshot,
  remove: removeDictionarySnapshot,
})

/** 组件响应会话及逐字典代次变化；路由和普通方法直接使用 dictionaryStore。 */
export function useDictionaryStore<T>(
  selector: (state: ReturnType<typeof dictionaryStore.getState>) => T,
): T {
  return useStore(dictionaryStore, selector)
}

/** ProFormSelect.request 和其他业务消费者的统一入口，命中缓存无需网络。 */
export function requestDictionaryOptions(input: DictionaryOptionsRequest) {
  return dictionaryStore.getState().ensureDictionary(input)
}

/** 共享 Cookie 在其他标签变化后，本页分别清理内存及 sessionStorage。 */
function syncSession() {
  dictionaryStore.getState().syncSession()
}
/** 退出时强制清除残留选项及在途操作，覆盖令牌已自然过期的情况。 */
function sessionChanged() {
  syncSession()
  if (!cookie.get('token')) invalidate()
}
/** 权限重验或管理变更后丢弃本地授权范围内的旧选项。 */
function invalidate() {
  dictionaryStore.getState().invalidate()
}
/** 工作空间快照跨页清除说明会话或授权可能变化，需重新校验。 */
function storageChanged(event: StorageEvent) {
  syncSession()
  if (event.key === null || (event.key === WORKSPACES_STORAGE_KEY && event.newValue === null))
    invalidate()
}
if (typeof window !== 'undefined') {
  window.addEventListener('auth-session-change', sessionChanged)
  window.addEventListener('focus', syncSession)
  window.addEventListener('storage', storageChanged)
  window.addEventListener('workspace-access-refresh', invalidate)
  import.meta.hot?.dispose(() => {
    invalidate()
    window.removeEventListener('auth-session-change', sessionChanged)
    window.removeEventListener('focus', syncSession)
    window.removeEventListener('storage', storageChanged)
    window.removeEventListener('workspace-access-refresh', invalidate)
  })
}
dictionaryStore.getState().syncSession()
