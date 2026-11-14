<script setup lang="ts">
import type {
  AccessScope,
  GlobalAccountCandidate,
  GlobalAccountCandidatePurpose,
  OrganizationMemberCandidate,
  OrganizationMemberCandidatePurpose,
} from 'shared/types'
import { useI18n } from '@bubblesjs/i18n-vue'
import { App, Button, Select } from 'antdv-next'
import { accessScopeKey, getRequestErrorMessage } from 'shared/utils'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { managementApi } from '@/views/access/api'

type Candidate = GlobalAccountCandidate | OrganizationMemberCandidate
const props = defineProps<{
  scope: AccessScope
  purpose: GlobalAccountCandidatePurpose | OrganizationMemberCandidatePurpose
  multiple?: boolean
  organizationUnitIds?: string[]
  positionIds?: string[]
}>()
const emit = defineEmits<{ candidates: [records: Candidate[]] }>()
const value = defineModel<string | string[]>()
const candidates = ref<Candidate[]>([])
const query = ref('')
const page = ref(1)
const total = ref(0)
const busy = ref(false)
const { tr } = useI18n()
const { message } = App.useApp()
const api = computed(() => managementApi(props.scope))
let controller: AbortController | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let resolveController: AbortController | undefined
const global = computed(() => props.scope.type === 'platform')
const reasons = {
  accountInactive: '账号已停用',
  memberInactive: '成员已停用',
  scopeInactive: '空间已停用',
  organizationInactive: '组织已停用',
  positionInactive: '岗位已停用',
}
const options = computed(() =>
  candidates.value.map((item) => ({
    value: item.userId,
    label: `${item.name} · ${item.account}${
      item.disabledReason ? `（${tr(reasons[item.disabledReason])}）` : ''
    }`,
    disabled: item.disabled,
  })),
)
/** 分页检索服务端候选；连续搜索中止过期请求，保留已选对象名称。 */
async function load(append = false) {
  controller?.abort()
  const request = new AbortController()
  controller = request
  busy.value = true
  const next = append ? page.value + 1 : 1
  try {
    const result = global.value
      ? await api.value.globalAccountCandidates(
          {
            page: next,
            pageSize: 30,
            query: query.value,
            purpose: props.purpose as GlobalAccountCandidatePurpose,
          },
          request.signal,
        )
      : await api.value.organizationMemberCandidates(
          {
            page: next,
            pageSize: 30,
            query: query.value,
            purpose: props.purpose as OrganizationMemberCandidatePurpose,
            organizationUnitIds: props.organizationUnitIds,
            positionIds: props.positionIds,
          },
          request.signal,
        )
    if (request.signal.aborted) return
    const selected = Array.isArray(value.value) ? value.value : value.value ? [value.value] : []
    const merged = [
      ...(append
        ? candidates.value
        : candidates.value.filter((item) => selected.includes(item.userId))),
      ...result.items,
    ]
    candidates.value = [...new Map(merged.map((item) => [item.userId, item])).values()]
    emit('candidates', candidates.value)
    page.value = next
    total.value = result.total
  } catch (error) {
    if (!request.signal.aborted) message.error(getRequestErrorMessage(error, tr('候选加载失败')))
  } finally {
    if (controller === request) busy.value = false
  }
}
/** 回填服务端对象名，禁止用输入的名称或账号冒充 userId。 */
async function resolve() {
  resolveController?.abort()
  const request = new AbortController()
  resolveController = request
  const ids = (Array.isArray(value.value) ? value.value : value.value ? [value.value] : []).filter(
    (id) => !candidates.value.some((item) => item.userId === id),
  )
  if (!ids.length) return
  try {
    const result: Candidate[] = []
    for (let offset = 0; offset < ids.length; offset += 100) {
      const userIds = ids.slice(offset, offset + 100)
      const batch = global.value
        ? await api.value.resolveGlobalAccountCandidates(
            { userIds, purpose: props.purpose as GlobalAccountCandidatePurpose },
            request.signal,
          )
        : await api.value.resolveOrganizationMemberCandidates(
            { userIds, purpose: props.purpose as OrganizationMemberCandidatePurpose },
            request.signal,
          )
      if (request.signal.aborted) return
      result.push(...batch)
    }
    candidates.value = [
      ...new Map([...candidates.value, ...result].map((item) => [item.userId, item])).values(),
    ]
    emit('candidates', candidates.value)
  } catch (error) {
    if (!request.signal.aborted) message.error(getRequestErrorMessage(error, tr('候选加载失败')))
  }
}
/** 输入搜索词后延迟查询，避免每个按键产生请求。 */
function search(text: string) {
  controller?.abort()
  busy.value = false
  query.value = text
  clearTimeout(timer)
  timer = setTimeout(() => void load(), 250)
}
watch(value, resolve, { immediate: true })
watch(
  () => [accessScopeKey(props.scope), props.purpose, props.organizationUnitIds, props.positionIds],
  () => {
    controller?.abort()
    clearTimeout(timer)
    candidates.value = []
    page.value = 1
    total.value = 0
    void resolve()
    void load()
  },
)
onBeforeUnmount(() => {
  controller?.abort()
  resolveController?.abort()
  clearTimeout(timer)
})
</script>

<template>
  <Select
    v-model:value="value"
    style="width: 100%"
    :mode="multiple ? 'multiple' : undefined"
    :options="options"
    :loading="busy"
    show-search
    allow-clear
    :filter-option="false"
    :placeholder="tr('搜索姓名或账号')"
    @search="search"
    @open-change="(opened) => opened && load()"
  >
    <template #popupRender="menuNode">
      <component :is="menuNode" />
      <Button
        v-if="page * 30 < total"
        type="text"
        block
        :loading="busy"
        @mousedown.prevent
        @click="load(true)"
      >
        {{ tr('加载更多') }}
      </Button>
    </template>
  </Select>
</template>
