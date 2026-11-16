<script setup lang="ts">
import type { MenuNode } from 'shared/types'
import { Card, Descriptions, Empty, Space, Tag } from 'antdv-next'
import { accessRoutePath } from 'shared/utils'
import { computed } from 'vue'
import { useWorkspace } from '@/components/management/useWorkspace'
import NavigationIcon from '@/components/navigation/NavigationIcon.vue'
import { navigationMenus } from '@/router/access'
import '@/styles/workspace/home.css'

const { store, scope, title, tr } = useWorkspace()
const typeName = computed(() =>
  tr(scope.type === 'platform' ? '平台' : scope.type === 'company' ? '企业' : '项目'),
)
const roleName = computed(() =>
  tr(
    store.access?.administrator === 'platform'
      ? '平台管理员'
      : store.access?.administrator === 'company'
        ? '企业管理员'
        : store.access?.administrator === 'project'
          ? '项目管理员'
          : '普通成员',
  ),
)
/** 仅将当前授权菜单中的可导航页面作为工作台入口。 */
function flatten(nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((node) => (node.type === 'directory' ? flatten(node.children) : [node]))
}
const entries = computed(() => (store.access ? flatten(navigationMenus(store.access)) : []))
const descriptions = computed(() => [
  { key: 'name', label: tr('当前用户'), content: store.user?.name },
  { key: 'account', label: tr('完整账号'), content: store.user?.account },
  { key: 'scope', label: tr('工作空间'), content: typeName.value },
  { key: 'role', label: tr('当前身份') },
])
</script>

<template>
  <div class="workspace-stateless-home">
    <div class="workspace-page-title">
      <h1>{{ title }}</h1>
      <p>{{ tr('查看当前身份，选择你需要的管理功能。') }}</p>
    </div>
    <Descriptions bordered :column="{ xs: 1, sm: 2 }" :items="descriptions">
      <template #contentRender="{ item, value }">
        <Tag v-if="item.key === 'role'" :color="store.access?.administrator ? 'cyan' : undefined">{{
          roleName
        }}</Tag>
        <template v-else>{{ value }}</template>
      </template>
    </Descriptions>
    <Card :title="tr('可用功能')">
      <Space v-if="entries.length" :size="[24, 18]" wrap>
        <RouterLink
          v-for="entry in entries"
          :key="entry.id"
          :to="accessRoutePath({ scope, routeKey: entry.routeKey! })!"
        >
          <NavigationIcon :name="entry.icon" /> {{ tr(entry.name) }}
        </RouterLink>
      </Space>
      <Empty v-else :description="tr('当前没有可用的菜单，请联系管理员授权。')" />
    </Card>
  </div>
</template>
