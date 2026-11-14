import type { DictionaryOption, DictionaryReference } from 'shared/types'
import { accessScopeKey } from 'shared/utils'
import { ref } from 'vue'
import { cookie } from '@/utils/storage/cookie'
import { fetchDictionaryItems } from '@/views/dictionaries/api'

const entries = new Map<
  string,
  { token: string | null; controller: AbortController; promise: Promise<DictionaryOption[]> }
>()
const revision = ref(0)

/** 缓存键使用完整作用域，企业或项目间同名字典不会混用。 */
function keyOf(reference: DictionaryReference) {
  return `${accessScopeKey(reference.scope)}:${reference.code}`
}

/** 失效时同时中止请求，防止已经打开的选择器回填旧值。 */
function invalidate(reference?: DictionaryReference) {
  for (const [key, entry] of entries) {
    if (!reference || key === keyOf(reference)) {
      entry.controller.abort()
      entries.delete(key)
    }
  }
  revision.value += 1
}

/** 合并同一会话同一字典的查询；失败可重试，迟到结果不进入缓存。 */
function load(reference: DictionaryReference): Promise<DictionaryOption[]> {
  const key = keyOf(reference)
  const token = cookie.get('token')
  const cached = entries.get(key)
  if (cached?.token === token) return cached.promise
  cached?.controller.abort()
  const controller = new AbortController()
  const promise = fetchDictionaryItems({ ...reference, signal: controller.signal })
    .then((options) => {
      if (controller.signal.aborted || token !== cookie.get('token'))
        throw new DOMException('会话或字典已变化', 'AbortError')
      return options
    })
    .catch((error) => {
      if (entries.get(key)?.controller === controller) entries.delete(key)
      throw error
    })
  entries.set(key, { token, controller, promise })
  return promise
}

const reset = () => invalidate()
window.addEventListener('auth-session-change', reset)
window.addEventListener('workspace-access-refresh', reset)
import.meta.hot?.dispose(() => {
  reset()
  window.removeEventListener('auth-session-change', reset)
  window.removeEventListener('workspace-access-refresh', reset)
})

export const dictionaryCache = { load, invalidate, revision }
