import { createStore } from 'zustand/vanilla'
import type {
  DictionaryOption,
  DictionaryOptionsRequest,
  DictionaryReference,
  WorkspacesResult,
} from 'shared/types'
import { dictionaryKey } from 'shared/utils'
import {
  DICTIONARY_MAX_ENTRIES,
  DICTIONARY_TTL,
  type DictionaryCacheEntry,
  type DictionarySnapshot,
} from './model'

interface Dependencies {
  session: () => string | null
  identity: () => Promise<WorkspacesResult>
  fetch: (input: DictionaryReference & { signal: AbortSignal }) => Promise<DictionaryOption[]>
  read: (ownerUserId: string) => DictionarySnapshot | undefined
  save: (snapshot: DictionarySnapshot) => void
  remove: () => void
}
interface DictionaryState {
  entries: Record<string, DictionaryCacheEntry>
  sessionEpoch: number
  revisions: Record<string, number>
  ensureDictionary: (input: DictionaryOptionsRequest) => Promise<DictionaryOption[]>
  invalidate: (reference?: DictionaryReference) => void
  syncSession: () => void
}
interface Operation {
  controller: AbortController
  promise: Promise<DictionaryOption[]>
}

/** 判断已联网核对的工作空间是否足以复用私有缓存；不满足时仍可交后端实时授权读取。 */
function canReuse(input: { reference: DictionaryReference; identity: WorkspacesResult }): boolean {
  const scope = input.reference.scope
  if (scope.type === 'platform') return true
  return input.identity.workspaces.some((entry) => {
    if (entry.scope.type === 'platform' || entry.scope.companyId !== scope.companyId) return false
    if (scope.type === 'company') return true
    return (
      (entry.scope.type === 'project' && entry.scope.projectId === scope.projectId) ||
      (entry.scope.type === 'company' && entry.administrator === 'company')
    )
  })
}

/** 返回副本并执行本地搜索，避免调用者修改完整缓存或搜索结果覆盖字典。 */
function filterOptions(items: DictionaryOption[], keyWords = '') {
  const keyword = keyWords.trim().toLocaleLowerCase()
  return items
    .filter(
      (item) =>
        !keyword ||
        item.label.toLocaleLowerCase().includes(keyword) ||
        item.value.toLocaleLowerCase().includes(keyword),
    )
    .map((item) => ({ ...item }))
}

/** 创建可独立验证的单索引 store；身份、HTTP 与持久化由应用接入层提供。 */
export function createDictionaryStore(deps: Dependencies) {
  return createStore<DictionaryState>((set, get) => {
    let session: string | null | undefined
    let ownerUserId = ''
    let restored = false
    const pending = new Map<string, Operation>()

    /** 清理过期记录并限制总量，持久化不包含运行态和身份凭据。 */
    function publish(entries: DictionaryState['entries']) {
      const now = Date.now()
      const current = Object.fromEntries(
        Object.entries(entries)
          .filter(([, entry]) => entry.expiresAt > now)
          .sort(([, a], [, b]) => b.fetchedAt - a.fetchedAt)
          .slice(0, DICTIONARY_MAX_ENTRIES),
      )
      set({ entries: current })
      if (ownerUserId) deps.save({ schemaVersion: 1, ownerUserId, entries: current })
    }

    /** 使全部旧操作失效并可选删除快照；首次初始化保留待身份核对的快照。 */
    function reset(remove: boolean) {
      for (const operation of pending.values()) operation.controller.abort()
      pending.clear()
      ownerUserId = ''
      restored = false
      if (remove) deps.remove()
      set((state) => ({ entries: {}, revisions: {}, sessionEpoch: state.sessionEpoch + 1 }))
    }

    /** 请求前和会话通知时核对 Cookie，退出、换号立即使旧代次无效。 */
    function syncSession() {
      const token = deps.session()
      if (token === session) return
      const initialized = session !== undefined
      session = token
      reset(initialized || !token)
    }

    /** 主动失效推进键代次并取消在途操作，未挂载的消费者同样不能获得旧结果。 */
    function invalidate(reference?: DictionaryReference) {
      if (!reference) {
        reset(true)
        return
      }
      const key = dictionaryKey(reference)
      pending.get(key)?.controller.abort()
      pending.delete(key)
      if (!ownerUserId) deps.remove()
      const entries = { ...get().entries }
      delete entries[key]
      set((state) => ({
        revisions: { ...state.revisions, [key]: (state.revisions[key] ?? 0) + 1 },
      }))
      publish(entries)
    }

    /** 恢复时核对服务端用户和访问资格，网络完成后再次检查会话及失效代次。 */
    async function load(input: {
      reference: DictionaryReference
      controller: AbortController
      epoch: number
      revision: number
      token: string
    }) {
      const { reference, controller, epoch, revision, token } = input
      const key = dictionaryKey(reference)
      /** 即使传输取消无效，也阻止旧结果写入和返回。 */
      function assertCurrent() {
        syncSession()
        if (
          controller.signal.aborted ||
          token !== session ||
          epoch !== get().sessionEpoch ||
          revision !== (get().revisions[key] ?? 0)
        )
          throw new DOMException('字典请求已失效', 'AbortError')
      }
      assertCurrent()
      const identity = await deps.identity()
      assertCurrent()
      if (ownerUserId && ownerUserId !== identity.user.id) {
        reset(true)
        throw new DOMException('登录身份已变化', 'AbortError')
      }
      ownerUserId = identity.user.id
      if (!restored) {
        restored = true
        const snapshot = deps.read(ownerUserId)
        if (snapshot)
          publish(
            Object.fromEntries(
              Object.entries(snapshot.entries).filter(([, entry]) =>
                canReuse({ reference: entry, identity }),
              ),
            ),
          )
      }
      const cached = get().entries[key]
      const reusable = canReuse({ reference, identity })
      if (cached && cached.expiresAt > Date.now() && reusable) return filterOptions(cached.items)
      try {
        const items = await deps.fetch({ ...reference, signal: controller.signal })
        assertCurrent()
        const fetchedAt = Date.now()
        if (reusable)
          publish({
            ...get().entries,
            [key]: {
              ...reference,
              items: filterOptions(items),
              fetchedAt,
              expiresAt: fetchedAt + DICTIONARY_TTL,
            },
          })
        return filterOptions(items)
      } catch (error) {
        assertCurrent()
        throw error
      }
    }

    return {
      entries: {},
      revisions: {},
      sessionEpoch: 0,
      syncSession,
      invalidate,
      /** 同键完整结果共享 Promise；每个消费者的搜索仅过滤返回副本。 */
      async ensureDictionary({ keyWords, ...reference }) {
        syncSession()
        if (!session) throw new DOMException('尚未登录', 'AbortError')
        const key = dictionaryKey(reference)
        let operation = pending.get(key)
        if (!operation) {
          const controller = new AbortController()
          // 在微任务开始前固定代次，防止同步退出后旧操作使用新身份发请求。
          const epoch = get().sessionEpoch
          const revision = get().revisions[key] ?? 0
          const token = session
          operation = {
            controller,
            promise: Promise.resolve().then(() =>
              load({ reference, controller, epoch, revision, token }),
            ),
          }
          pending.set(key, operation)
          const current = operation
          /** 较晚的旧操作结束不能删除新代次的在途记录。 */
          const complete = () => {
            if (pending.get(key) === current) pending.delete(key)
          }
          void operation.promise.then(complete, complete)
        }
        return filterOptions(await operation.promise, keyWords)
      },
    }
  })
}
