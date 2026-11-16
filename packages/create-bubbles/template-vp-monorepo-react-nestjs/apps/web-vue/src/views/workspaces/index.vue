<script setup lang="ts">
import type { ScopeType, WorkspaceEntry } from 'shared/types'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@antdv-next/icons'
import { useI18n } from '@bubblesjs/i18n-vue'
import { Alert, Button, Card, Empty, Input, Pagination, Select } from 'antdv-next'
import { accessScopeBasePath, accessScopeKey, getRequestErrorMessage } from 'shared/utils'
import { computed, ref, watch } from 'vue'
import AccountMenu from '@/components/application/AccountMenu.vue'
import LocaleSwitch from '@/components/application/LocaleSwitch.vue'
import Brand from '@/components/brand/Brand.vue'
import { useUserStore } from '@/store/modules/user'
import '@/styles/workspace/landing.css'

const store = useUserStore()
const { tr } = useI18n()
const query = ref('')
const company = ref('')
const type = ref<ScopeType | 'all'>('all')
const page = ref(1)
const refreshing = ref(false)
const error = ref('')
const pageSize = 6
const types = [
  { value: 'all', label: '全部' },
  { value: 'platform', label: '平台' },
  { value: 'company', label: '企业' },
  { value: 'project', label: '项目' },
] as const
const labels = { platform: '平台', company: '企业', project: '项目' }
const companies = computed(() => {
  const names = new Map<string, string>()
  for (const entry of store.workspaces) {
    if (entry.scope.type === 'company') names.set(entry.scope.companyId, entry.name)
  }
  for (const entry of store.workspaces) {
    if (entry.scope.type === 'project' && !names.has(entry.scope.companyId))
      names.set(entry.scope.companyId, entry.companyName || entry.scope.companyId)
  }
  return names
})
const companyOptions = computed(() => [
  { value: '', label: tr('全部企业') },
  ...[...companies.value].map(([value, label]) => ({ value, label })),
])
const matching = computed(() => {
  const search = query.value.trim().toLowerCase()
  return store.workspaces.filter((entry) => {
    const companyName =
      entry.scope.type === 'platform' ? '' : companies.value.get(entry.scope.companyId) || ''
    return (
      `${entry.name} ${companyName}`.toLowerCase().includes(search) &&
      (!company.value ||
        (entry.scope.type !== 'platform' && entry.scope.companyId === company.value))
    )
  })
})
const counts = computed(() => ({
  all: matching.value.length,
  platform: matching.value.filter((entry) => entry.scope.type === 'platform').length,
  company: matching.value.filter((entry) => entry.scope.type === 'company').length,
  project: matching.value.filter((entry) => entry.scope.type === 'project').length,
}))
const filtered = computed(() =>
  matching.value.filter((entry) => type.value === 'all' || entry.scope.type === type.value),
)
const currentPage = computed(() =>
  Math.min(page.value, Math.max(1, Math.ceil(filtered.value.length / pageSize))),
)
const entries = computed(() =>
  filtered.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize),
)
/** 清单缩页后同步实际页码，避免再次扩容时恢复旧页码。 */
watch(currentPage, (value) => {
  page.value = value
})
// 离开空间时授权上下文会被清空，仅保留上一个空间 key 供列表显示返回入口。
const previousWorkspaceKey =
  typeof window.history.state?.workspaceKey === 'string' ? window.history.state.workspaceKey : ''
const currentKey = computed(() =>
  store.access ? accessScopeKey(store.access.scope) : previousWorkspaceKey,
)
const currentEntry = computed(() =>
  store.workspaces.find((entry) => accessScopeKey(entry.scope) === currentKey.value),
)
watch([query, company, type], () => {
  page.value = 1
})
watch(companies, (names) => {
  if (!names.has(company.value)) company.value = ''
})

/** 重读服务端授权空间，失败保留现有清单并提供重试入口。 */
async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  error.value = ''
  try {
    await store.loadWorkspaces(true)
  } catch (cause) {
    error.value = getRequestErrorMessage(cause, tr('工作空间加载失败，请重试'))
  } finally {
    refreshing.value = false
  }
}
/** 清空所有筛选并回到第一页。 */
function clearFilters() {
  query.value = ''
  company.value = ''
  type.value = 'all'
  page.value = 1
}
/** 按空间类型显示归属或管理范围，与 React 空间卡片保持一致。 */
function description(entry: WorkspaceEntry) {
  if (entry.scope.type === 'project')
    return tr('所属企业 · {name}', {
      name:
        companies.value.get(entry.scope.companyId) || entry.companyName || entry.scope.companyId,
    })
  return tr(entry.scope.type === 'platform' ? '管理企业、账号与平台功能' : '企业协作工作空间')
}
</script>

<template>
  <main class="workspace-landing">
    <header class="workspace-landing-header">
      <Brand variant="workspace" />
      <div class="workspace-landing-actions">
        <LocaleSwitch />
        <span class="workspace-landing-action-divider" aria-hidden="true" />
        <AccountMenu />
      </div>
    </header>
    <section class="workspace-landing-main">
      <div class="workspace-page-heading">
        <div class="workspace-page-title">
          <h1>{{ tr('选择工作空间') }}</h1>
          <p>
            {{
              tr('你好，{name}。进入企业或项目，继续你的工作。', { name: store.user?.name || '' })
            }}
          </p>
        </div>
        <RouterLink
          v-if="currentEntry"
          class="workspace-return-current"
          :to="accessScopeBasePath(currentEntry.scope)"
        >
          <ArrowLeftOutlined />
          <span>{{ tr('返回当前空间') }}</span>
          <span class="workspace-return-name">{{ currentEntry.name }}</span>
        </RouterLink>
      </div>
      <Alert v-if="error" type="error" show-icon :message="error" class="workspace-refresh-error" />
      <div class="workspace-filters">
        <Input
          v-model:value="query"
          allow-clear
          :placeholder="tr('搜索空间名称或所属企业')"
          :aria-label="tr('搜索工作空间')"
          class="workspace-search"
        >
          <template #prefix><SearchOutlined /></template>
        </Input>
        <Select
          v-model:value="company"
          :options="companyOptions"
          :aria-label="tr('所属企业')"
          class="workspace-company-filter"
        />
        <Button class="workspace-refresh" :loading="refreshing" @click="refresh">
          <template #icon><ReloadOutlined /></template>
          {{ tr('刷新工作空间') }}
        </Button>
      </div>
      <div class="workspace-categories" role="group" :aria-label="tr('空间类型')">
        <button
          v-for="category in types"
          :key="category.value"
          type="button"
          :aria-pressed="type === category.value"
          @click="type = category.value"
        >
          {{ tr(category.label) }}
          <span class="workspace-category-count">{{ counts[category.value] }}</span>
        </button>
      </div>
      <Card v-if="!store.workspaces.length" class="workspace-empty">
        <Empty>
          <template #description>
            <strong>{{ tr('暂未加入企业，请联系企业管理员') }}</strong>
            <p>{{ tr('加入企业后，刷新此页即可进入。') }}</p>
          </template>
        </Empty>
      </Card>
      <Card v-else-if="!entries.length" class="workspace-empty">
        <Empty :description="tr('没有匹配的工作空间，请调整搜索条件。')">
          <Button @click="clearFilters">{{ tr('清空筛选条件') }}</Button>
        </Empty>
      </Card>
      <template v-else>
        <div class="workspace-grid">
          <Card
            v-for="entry in entries"
            :key="accessScopeKey(entry.scope)"
            class="workspace-card"
            :class="[
              `workspace-card-${entry.scope.type}`,
              { 'workspace-card-current': currentKey === accessScopeKey(entry.scope) },
            ]"
          >
            <div class="workspace-card-meta">
              <span class="workspace-type-tag">{{ tr(labels[entry.scope.type]) }}</span>
              <span class="workspace-role">{{ tr(entry.administrator ? '管理员' : '成员') }}</span>
              <span v-if="currentKey === accessScopeKey(entry.scope)" class="workspace-current-mark"
                ><CheckOutlined /> {{ tr('当前空间') }}</span
              >
            </div>
            <h3 :title="entry.name">{{ entry.name }}</h3>
            <p :title="description(entry)">{{ description(entry) }}</p>
            <RouterLink
              class="workspace-enter"
              :to="accessScopeBasePath(entry.scope)"
              :aria-label="`${tr(currentKey === accessScopeKey(entry.scope) ? '返回空间' : '进入空间')} · ${entry.name}`"
            >
              {{ tr(currentKey === accessScopeKey(entry.scope) ? '返回空间' : '进入空间') }}
              <ArrowRightOutlined />
            </RouterLink>
          </Card>
        </div>
        <footer class="workspace-pagination">
          <p aria-live="polite">
            {{ tr('共 {count} 个空间', { count: filtered.length }) }}
            <span>{{
              tr('当前展示 {start}–{end}', {
                start: (currentPage - 1) * pageSize + 1,
                end: Math.min(currentPage * pageSize, filtered.length),
              })
            }}</span>
          </p>
          <Pagination
            :current="currentPage"
            :total="filtered.length"
            :page-size="pageSize"
            :show-size-changer="false"
            show-less-items
            @change="page = $event"
          />
          <span class="workspace-page-size">{{ tr('{count} 个 / 页', { count: pageSize }) }}</span>
        </footer>
      </template>
    </section>
  </main>
</template>
