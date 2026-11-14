<script setup lang="ts">
import { Tag } from 'antdv-next'
import { accessRoutePath } from 'shared/utils'
import { computed } from 'vue'
import PageHeading from '@/components/management/PageHeading.vue'
import { useWorkspace } from '@/components/management/useWorkspace'
import { supportedPages } from '@/router/access'

const { store, scope, title, tr } = useWorkspace()
const pages = computed(() =>
  supportedPages.filter(
    (page) =>
      page.scopeType === scope.type &&
      !page.routeKey.endsWith('.home') &&
      store.access?.permissionKeys.includes(page.permissionKey),
  ),
)
</script>

<template>
  <PageHeading :title="title" :description="tr('在这里管理团队、权限和项目，保持协作井然有序。')" />
  <div class="stat-grid">
    <div class="stat-card">
      <span>{{ tr('当前身份') }}</span>
      <strong>{{ store.user?.name }}</strong>
      <Tag color="purple">
        {{ tr(store.access?.administrator ? '管理员' : '成员') }}
      </Tag>
    </div>
    <div class="stat-card">
      <span>{{ tr('可访问页面') }}</span>
      <strong>{{ pages.length }}</strong>
      <span>{{ tr('根据当前权限展示') }}</span>
    </div>
    <div class="stat-card">
      <span>{{ tr('我的工作空间') }}</span>
      <strong>{{ store.workspaces.length }}</strong>
      <RouterLink to="/workspaces">{{ tr('切换空间') }} ↗</RouterLink>
    </div>
  </div>
  <section class="panel">
    <h3>{{ tr('快捷入口') }}</h3>
    <p class="muted">
      {{ tr('按你的权限，为你准备常用功能。') }}
    </p>
    <div class="shortcut-grid">
      <RouterLink
        v-for="page in pages"
        :key="page.routeKey"
        :to="accessRoutePath({ scope, routeKey: page.routeKey })!"
        class="shortcut"
      >
        {{ tr(page.title) }}
        <span>↗</span>
      </RouterLink>
    </div>
  </section>
</template>
