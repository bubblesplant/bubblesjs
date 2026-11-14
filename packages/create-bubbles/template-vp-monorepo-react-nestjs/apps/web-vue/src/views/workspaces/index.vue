<script setup lang="ts">
import { useI18n } from '@bubblesjs/i18n-vue'
import { Button, Empty, Input, Tag } from 'antdv-next'
import { accessScopeBasePath, accessScopeKey } from 'shared/utils'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountMenu from '@/components/application/AccountMenu.vue'
import LocaleSwitch from '@/components/application/LocaleSwitch.vue'
import { useUserStore } from '@/store/modules/user'

const store = useUserStore()
const router = useRouter()
const { tr } = useI18n()
const query = ref('')
const spaces = computed(() =>
  store.workspaces.filter((item) =>
    (item.name + item.companyName).toLowerCase().includes(query.value.toLowerCase()),
  ),
)
const labels = { platform: '平台空间', company: '企业空间', project: '项目空间' }
</script>

<template>
  <div class="workspace-page">
    <header class="workspace-top">
      <RouterLink to="/" class="brand">
        <span class="brand-mark small">b.</span>
        Bubbles
      </RouterLink>
      <div>
        <LocaleSwitch />
        <AccountMenu />
      </div>
    </header>
    <main class="workspace-main">
      <span class="eyebrow">YOUR WORKSPACES</span>
      <h1>{{ tr('选择工作空间') }}</h1>
      <p>
        {{ tr('欢迎回来') }}，{{ store.user?.name }}。{{ tr('选择一个空间，开始今天的工作。') }}
      </p>
      <Input
        v-model:value="query"
        allow-clear
        :placeholder="tr('搜索工作空间')"
        class="workspace-search"
      />
      <div class="workspace-grid">
        <button
          v-for="entry in spaces"
          :key="accessScopeKey(entry.scope)"
          class="workspace-card"
          @click="router.push(accessScopeBasePath(entry.scope))"
        >
          <div class="workspace-symbol">
            {{ entry.scope.type === 'platform' ? '◈' : entry.scope.type === 'company' ? '▦' : '◇' }}
          </div>
          <Tag>{{ tr(labels[entry.scope.type]) }}</Tag>
          <h2>{{ entry.name }}</h2>
          <p>{{ entry.companyName || tr('独立的管理与协作空间') }}</p>
          <footer>
            <span>{{ tr(entry.administrator ? '管理员' : '成员') }}</span>
            <span>{{ tr('进入空间') }} ↗</span>
          </footer>
        </button>
      </div>
      <Empty
        v-if="!spaces.length"
        :description="tr(query ? '没有匹配的工作空间' : '暂无可访问空间，请联系管理员')"
      />
      <Button type="link" @click="router.push('/examples/pro-table')">
        {{ tr('查看组件示例') }} ↗
      </Button>
    </main>
  </div>
</template>
